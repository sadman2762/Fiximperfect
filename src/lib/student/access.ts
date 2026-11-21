import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { hashToken, isWellFormedToken } from "@/lib/security/tokens";
import { STATUS_LABELS } from "@/lib/tickets/state-machine";
import type { Priority, TicketStatus } from "@/types/domain";
import { placeName } from "@/lib/locations/label";

export interface StudentView {
  report: { id: string; report_number: string; description: string; created_at: string; link_status: string | null };
  ticket: {
    ticket_number: string;
    title: string;
    category: string;
    priority: Priority;
    status: TicketStatus;
    safety_level: string;
    report_count: number;
    resolution_verified: boolean;
  } | null;
  location: { building: string; floor: number; area: string; asset: string | null };
  timeline: { at: string; label: string }[];
}

const PUBLIC_EVENTS: Record<string, (e: { new_value: string | null }) => string | null> = {
  ticket_created: () => "Ticket created",
  status_changed: (e) => (e.new_value ? `Status: ${STATUS_LABELS[e.new_value as TicketStatus] ?? e.new_value}` : null),
  report_linked: () => "A report was linked to this ticket",
  safety_escalated: () => "Escalated as a safety issue",
  emergency_alert_sent: () => "Staff alerted about a safety hazard",
  emergency_acknowledged: () => "Staff acknowledged the safety alert",
  feedback_requested: () => "Reporters asked to confirm the repair",
  feedback_negative: () => "A reporter said the problem is not fixed",
  student_verified: () => "All reporters confirmed the fix",
  tickets_merged: () => "Duplicate reports merged into this ticket",
};

/** Resolves a student token to that one report — never to other students' data. */
export async function studentViewByToken(token: string): Promise<StudentView | null> {
  if (!isWellFormedToken(token)) return null;
  const db = adminClient();
  const hash = hashToken(token);
  let reportId: string | null = null;
  const { data: direct } = await db.from("reports").select("id").eq("tracking_token_hash", hash).maybeSingle();
  if (direct) reportId = direct.id;
  else {
    const { data: extra } = await db
      .from("student_access_tokens")
      .select("report_id, expires_at")
      .eq("token_hash", hash)
      .eq("purpose", "tracking")
      .maybeSingle();
    if (extra && new Date(extra.expires_at) > new Date()) reportId = extra.report_id;
  }
  if (!reportId) return null;
  return studentViewByReportId(reportId);
}

export async function studentViewByReportId(reportId: string): Promise<StudentView | null> {
  const db = adminClient();
  const { data: r } = await db
    .from("reports")
    .select("id, report_number, description, created_at, link_status, ticket_id, locations(area_name, floor, room_number, buildings(name)), assets(asset_name)")
    .eq("id", reportId)
    .single();
  if (!r) return null;
  const rep = r as unknown as {
    id: string; report_number: string; description: string; created_at: string; link_status: string | null; ticket_id: string | null;
    locations: { area_name: string; floor: number; room_number: string | null; buildings: { name: string } }; assets: { asset_name: string } | null;
  };
  let ticket: StudentView["ticket"] = null;
  let timeline: StudentView["timeline"] = [{ at: rep.created_at, label: "You submitted this report" }];
  if (rep.ticket_id) {
    const { data: t } = await db
      .from("tickets")
      .select("ticket_number, title, category, priority, status, safety_level, resolution_verified, merged_into")
      .eq("id", rep.ticket_id)
      .single();
    const { count } = await db.from("reports").select("id", { count: "exact", head: true }).eq("ticket_id", rep.ticket_id);
    if (t) ticket = { ...(t as Omit<NonNullable<StudentView["ticket"]>, "report_count">), report_count: count ?? 1 };
    const { data: events } = await db
      .from("ticket_events")
      .select("event_type, new_value, created_at")
      .eq("ticket_id", rep.ticket_id)
      .order("created_at");
    timeline = timeline.concat(
      (events ?? [])
        .filter((e) => new Date(e.created_at) >= new Date(new Date(rep.created_at).getTime() - 60_000) || e.event_type === "ticket_created")
        .map((e) => ({ at: e.created_at, label: PUBLIC_EVENTS[e.event_type]?.(e) ?? null }))
        .filter((e): e is { at: string; label: string } => Boolean(e.label)),
    );
    timeline.sort((a, b) => a.at.localeCompare(b.at));
  }
  return {
    report: { id: rep.id, report_number: rep.report_number, description: rep.description, created_at: rep.created_at, link_status: rep.link_status },
    ticket,
    location: { building: rep.locations.buildings.name, floor: rep.locations.floor, area: placeName(rep.locations), asset: rep.assets?.asset_name ?? null },
    timeline,
  };
}

/** History tokens list only reports submitted with the email the link was sent to. */
export async function historyByToken(token: string) {
  if (!isWellFormedToken(token)) return null;
  const db = adminClient();
  const { data: t } = await db
    .from("student_access_tokens")
    .select("reporter_email, expires_at")
    .eq("token_hash", hashToken(token))
    .eq("purpose", "history")
    .maybeSingle();
  if (!t || new Date(t.expires_at) < new Date()) return null;
  const { data: reports } = await db
    .from("reports")
    .select("id")
    .eq("reporter_email", t.reporter_email)
    .order("created_at", { ascending: false })
    .limit(50);
  const views = await Promise.all((reports ?? []).map((r) => studentViewByReportId(r.id)));
  return { email: t.reporter_email as string, reports: views.filter((v): v is StudentView => v !== null) };
}
