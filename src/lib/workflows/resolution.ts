import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/supabase/admin";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { appUrl } from "@/lib/env";
import { loadSettings } from "@/lib/settings";
import { sendNotification } from "@/lib/notifications/dispatcher";
import { resolutionRequest, staffTicketAlert } from "@/lib/notifications/templates";
import { caretakersFor, issueTrackingLink, studentEmailContext, teamMembersFor, ticketUrl } from "@/lib/notifications/recipients";

/**
 * Called when a ticket is marked resolved. Every unique reporter (by email)
 * receives their own secure, expiring feedback link. The unique constraint on
 * (resolution_event_id, reporter_email) guarantees no duplicate requests for
 * the same resolution event, even if this runs twice.
 */
export async function requestResolutionFeedback(ticketId: string, resolutionEventId: string) {
  const db = adminClient();
  const settings = await loadSettings(db);
  const { data: ticket } = await db
    .from("tickets")
    .select("id, ticket_number, title, assets(asset_name), locations(area_name)")
    .eq("id", ticketId)
    .single();
  const { data: reports } = await db
    .from("reports")
    .select("id, reporter_name, reporter_email, created_at")
    .eq("ticket_id", ticketId)
    .order("created_at");
  if (!ticket || !reports) return { requested: 0 };

  const byEmail = new Map<string, (typeof reports)[number]>();
  for (const r of reports) if (!byEmail.has(r.reporter_email.toLowerCase())) byEmail.set(r.reporter_email.toLowerCase(), r);

  const expires = new Date(Date.now() + settings.feedback_token_ttl_days * 86_400_000).toISOString();
  let requested = 0;
  for (const [email, r] of byEmail) {
    const token = generateToken();
    const { data: inserted, error } = await db
      .from("resolution_feedback")
      .upsert(
        {
          ticket_id: ticketId,
          report_id: r.id,
          reporter_email: email,
          feedback_token_hash: hashToken(token),
          resolution_event_id: resolutionEventId,
          expires_at: expires,
        },
        { onConflict: "resolution_event_id,reporter_email", ignoreDuplicates: true },
      )
      .select("id");
    if (error) {
      console.error("[resolution] feedback request failed", error.message);
      continue;
    }
    if (!inserted?.length) continue; // already requested for this resolution event
    requested++;
    const base = appUrl(`/feedback/${token}`);
    const trackingUrl = await issueTrackingLink(db, r.id);
    const tpl = resolutionRequest({
      ...(await studentEmailContext(db, r.id, trackingUrl)),
      status: "resolved",
      fixedUrl: `${base}?answer=fixed`,
      brokenUrl: `${base}?answer=still_broken`,
    });
    await sendNotification({
      audience: "student",
      channel: "email",
      recipient: email,
      type: "resolution_confirmation_request",
      ...tpl,
      secureLinks: [`${base}?answer=fixed`, `${base}?answer=still_broken`, base, trackingUrl],
      ticketId,
      reportId: r.id,
    });
  }
  await db.from("ticket_events").insert({
    ticket_id: ticketId,
    actor_label: "Resolution verification",
    event_type: "feedback_requested",
    new_value: String(requested),
    note: `Confirmation requested from ${requested} reporting student(s).`,
    metadata: { resolution_event_id: resolutionEventId },
  });
  return { requested };
}

export async function findFeedbackByToken(db: SupabaseClient, token: string) {
  const { data } = await db
    .from("resolution_feedback")
    .select(
      "id, ticket_id, report_id, response, responded_at, expires_at, resolution_event_id, " +
        "tickets(ticket_number, title, status, locations(area_name, floor), buildings(name), assets(asset_name)), reports(report_number, description)",
    )
    .eq("feedback_token_hash", hashToken(token))
    .maybeSingle();
  return data as unknown as {
    id: string;
    ticket_id: string;
    report_id: string;
    response: "fixed" | "still_broken" | null;
    responded_at: string | null;
    expires_at: string;
    resolution_event_id: string;
    tickets: {
      ticket_number: string;
      title: string;
      status: string;
      locations: { area_name: string; floor: number };
      buildings: { name: string };
      assets: { asset_name: string } | null;
    };
    reports: { report_number: string; description: string };
  } | null;
}

export class FeedbackError extends Error {
  constructor(
    message: string,
    public code: "not_found" | "already_responded" | "expired",
  ) {
    super(message);
  }
}

/** Records one student's response; a negative answer reopens the ticket. */
export async function submitFeedback(token: string, response: "fixed" | "still_broken", comment?: string | null) {
  const db = adminClient();
  const fb = await findFeedbackByToken(db, token);
  if (!fb) throw new FeedbackError("This feedback link is not valid.", "not_found");
  const { data, error } = await db.rpc("submit_resolution_feedback", {
    p_feedback_id: fb.id,
    p_response: response,
    p_comment: comment?.trim() || null,
  });
  if (error) {
    if (error.message.includes("already_responded")) throw new FeedbackError("You have already answered for this repair.", "already_responded");
    if (error.message.includes("feedback_expired")) throw new FeedbackError("This feedback link has expired.", "expired");
    throw new Error(`feedback failed: ${error.message}`);
  }
  const result = data as { ticket_id: string; reopened: boolean; verified: boolean };

  if (result.reopened) {
    const { data: t } = await db
      .from("tickets")
      .select("id, ticket_number, title, building_id, assigned_team_id, buildings(name), locations(area_name, floor)")
      .eq("id", result.ticket_id)
      .single();
    if (t) {
      const tt = t as unknown as { id: string; ticket_number: string; title: string; building_id: string; assigned_team_id: string | null; buildings: { name: string }; locations: { area_name: string; floor: number } };
      const recipients = [...(await caretakersFor(db, tt.building_id)), ...(await teamMembersFor(db, tt.assigned_team_id))];
      const seen = new Set<string>();
      for (const r of recipients) {
        if (seen.has(r.email)) continue;
        seen.add(r.email);
        const tpl = staffTicketAlert({
          kind: "Reopened by student feedback",
          ticketNumber: tt.ticket_number,
          title: tt.title,
          location: `${tt.buildings.name}, floor ${tt.locations.floor}, ${tt.locations.area_name}`,
          detail: `A reporting student says the problem is still not fixed.${comment ? ` Comment: "${comment.slice(0, 300)}"` : ""}`,
          url: ticketUrl(tt.id),
        });
        await sendNotification({ audience: "caretaker", channel: "email", recipient: r.email, type: "ticket_reopened_negative_feedback", ...tpl, ticketId: tt.id });
      }
    }
  }
  return result;
}

