import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/supabase/admin";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { appUrl } from "@/lib/env";
import { sendNotification, type Channel } from "@/lib/notifications/dispatcher";
import { emergencyAlert, staffTicketAlert } from "@/lib/notifications/templates";
import { managementRecipients, ticketUrl } from "@/lib/notifications/recipients";
import { HAZARD_LABEL, type HazardCode } from "@/lib/safety/rules";
import { loadSettings } from "@/lib/settings";

interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  escalation_order: number;
  contact_role: string;
}

async function ticketContext(db: SupabaseClient, ticketId: string) {
  const { data, error } = await db
    .from("tickets")
    .select("id, ticket_number, title, building_id, safety_level, safety_reason, escalation_status, buildings(name), locations(area_name, floor)")
    .eq("id", ticketId)
    .single();
  if (error || !data) throw new Error(`ticket not found: ${ticketId}`);
  const t = data as unknown as {
    id: string;
    ticket_number: string;
    title: string;
    building_id: string;
    safety_level: string;
    safety_reason: string | null;
    escalation_status: string;
    buildings: { name: string };
    locations: { area_name: string; floor: number };
  };
  return { ...t, locationText: `${t.buildings.name}, floor ${t.locations.floor}, ${t.locations.area_name}` };
}

async function hazardsText(db: SupabaseClient, ticketId: string, fallback: string | null) {
  const { data } = await db.from("reports").select("ai_analysis").eq("ticket_id", ticketId).order("created_at").limit(5);
  const codes = new Set<string>();
  for (const r of data ?? []) for (const h of ((r.ai_analysis as { safety?: { detected_hazards?: string[] } })?.safety?.detected_hazards ?? [])) codes.add(h);
  const labels = [...codes].map((c) => HAZARD_LABEL[c as HazardCode] ?? c);
  return labels.length ? labels.join(", ") : (fallback ?? "Critical safety hazard");
}

/** Sends one escalation attempt (all available channels) to a single contact. */
async function alertContact(db: SupabaseClient, ticketId: string, contact: Contact, attempt: number, timeoutMinutes: number) {
  const t = await ticketContext(db, ticketId);
  const hazards = await hazardsText(db, ticketId, t.safety_reason);
  const escalateAfter = new Date(Date.now() + timeoutMinutes * 60_000).toISOString();
  const channels: { channel: Channel; recipient: string }[] = [];
  if (contact.phone) channels.push({ channel: "sms", recipient: contact.phone }, { channel: "voice", recipient: contact.phone });
  if (contact.email) channels.push({ channel: "email", recipient: contact.email });

  const results = [];
  for (const { channel, recipient } of channels) {
    const token = generateToken();
    const ackUrl = appUrl(`/emergency/ack/${token}`);
    const { data: alert, error } = await db
      .from("emergency_alerts")
      .insert({
        ticket_id: ticketId,
        severity: "critical",
        contact_id: contact.id,
        recipient,
        recipient_name: contact.name,
        channel,
        delivery_status: "queued",
        ack_token_hash: hashToken(token),
        escalation_attempt: attempt,
        escalate_after: escalateAfter,
      })
      .select("id")
      .single();
    if (error || !alert) throw new Error(`could not create emergency alert: ${error?.message}`);
    const tpl = emergencyAlert({ ticketNumber: t.ticket_number, hazards, location: t.locationText, ackUrl, attempt });
    const res = await sendNotification({
      audience: "caretaker",
      channel,
      recipient,
      type: "emergency_alert",
      subject: tpl.subject,
      text: tpl.text,
      html: tpl.html,
      voiceText: tpl.voiceText,
      secureLinks: [ackUrl],
      ticketId,
      gatherActionUrl: channel === "voice" && appUrl().startsWith("https://") ? appUrl(`/api/webhooks/twilio/gather?alert=${alert.id}`) : undefined,
    });
    await db
      .from("emergency_alerts")
      .update({ delivery_status: res.status, provider_reference: res.providerReference ?? null, error_message: res.error ?? null })
      .eq("id", alert.id);
    results.push({ alertId: alert.id, channel, status: res.status });
  }
  await db.from("ticket_events").insert({
    ticket_id: ticketId,
    actor_label: "Emergency escalation",
    event_type: attempt === 1 ? "emergency_alert_sent" : "emergency_escalated",
    new_value: contact.name,
    note: `Attempt ${attempt}: ${contact.contact_role.replace(/_/g, " ")} alerted via ${channels.map((c) => c.channel).join(", ") || "no channel"} (${results.map((r) => `${r.channel}: ${r.status}`).join(", ")}).`,
    metadata: { attempt, contact_id: contact.id, results },
  });
  return results;
}

async function contactsFor(db: SupabaseClient, buildingId: string): Promise<Contact[]> {
  const { data } = await db
    .from("emergency_contacts")
    .select("id, name, email, phone, escalation_order, contact_role")
    .eq("building_id", buildingId)
    .order("escalation_order");
  return (data ?? []) as Contact[];
}

/**
 * Starts the emergency workflow for a critical ticket immediately (does not
 * wait for anyone to open the dashboard). Idempotent per ticket.
 */
export async function triggerEmergency(ticketId: string) {
  const db = adminClient();
  const t = await ticketContext(db, ticketId);
  if (t.escalation_status === "alerting" || t.escalation_status === "acknowledged") return { started: false, reason: "already_in_progress" };
  const settings = await loadSettings(db);
  const contacts = await contactsFor(db, t.building_id);
  await db.from("tickets").update({ escalation_status: contacts.length ? "alerting" : "exhausted" }).eq("id", ticketId);
  if (!contacts.length) {
    await db.from("ticket_events").insert({
      ticket_id: ticketId,
      actor_label: "Emergency escalation",
      event_type: "emergency_no_contacts",
      note: "No emergency contacts are configured for this building. Management has been notified.",
    });
    await notifyManagementExhausted(db, t);
    return { started: false, reason: "no_contacts" };
  }
  const results = await alertContact(db, ticketId, contacts[0], 1, settings.emergency_ack_timeout_minutes);
  return { started: true, contact: contacts[0].name, results };
}

async function notifyManagementExhausted(db: SupabaseClient, t: Awaited<ReturnType<typeof ticketContext>>) {
  const mgmt = await managementRecipients(db);
  for (const m of mgmt) {
    const tpl = staffTicketAlert({
      kind: "Unacknowledged emergency",
      ticketNumber: t.ticket_number,
      title: t.title,
      location: t.locationText,
      detail: "No emergency contact has acknowledged this critical safety alert. Please intervene.",
      url: ticketUrl(t.id),
    });
    await sendNotification({ audience: "management", channel: "email", recipient: m.email, type: "emergency_unacknowledged", ...tpl, ticketId: t.id });
  }
}

/** Acknowledges via a secure link token (from SMS/email). */
export async function acknowledgeByToken(token: string) {
  const db = adminClient();
  const { data: alert } = await db
    .from("emergency_alerts")
    .select("id, ticket_id, recipient_name, acknowledged_at")
    .eq("ack_token_hash", hashToken(token))
    .maybeSingle();
  if (!alert) return null;
  return acknowledge(db, alert.ticket_id, alert.id, alert.recipient_name ?? "Emergency contact", alert.acknowledged_at);
}

export async function acknowledgeByAlertId(alertId: string, actorLabel: string) {
  const db = adminClient();
  const { data: alert } = await db.from("emergency_alerts").select("id, ticket_id, acknowledged_at").eq("id", alertId).maybeSingle();
  if (!alert) return null;
  return acknowledge(db, alert.ticket_id, alert.id, actorLabel, alert.acknowledged_at);
}

/** Staff acknowledgement from the dashboard (acknowledges all open alerts of the ticket). */
export async function acknowledgeTicket(ticketId: string, staff: { id: string; full_name: string }) {
  const db = adminClient();
  const { data: open } = await db.from("emergency_alerts").select("id").eq("ticket_id", ticketId).is("acknowledged_at", null);
  const now = new Date().toISOString();
  if (open?.length) {
    await db.from("emergency_alerts").update({ acknowledged_at: now, acknowledged_by: staff.full_name }).in("id", open.map((a) => a.id));
  }
  await db.from("tickets").update({ escalation_status: "acknowledged" }).eq("id", ticketId);
  await db.from("ticket_events").insert({
    ticket_id: ticketId,
    actor_id: staff.id,
    actor_label: staff.full_name,
    event_type: "emergency_acknowledged",
    note: "Acknowledged from the caretaker dashboard.",
  });
  return { ticketId, acknowledgedAt: now };
}

async function acknowledge(db: SupabaseClient, ticketId: string, alertId: string, who: string, already: string | null) {
  if (already) return { ticketId, acknowledgedAt: already, alreadyAcknowledged: true };
  const now = new Date().toISOString();
  await db.from("emergency_alerts").update({ acknowledged_at: now, acknowledged_by: who }).eq("id", alertId);
  await db.from("tickets").update({ escalation_status: "acknowledged" }).eq("id", ticketId).neq("escalation_status", "acknowledged");
  await db.from("ticket_events").insert({
    ticket_id: ticketId,
    actor_label: who,
    event_type: "emergency_acknowledged",
    note: `Alert acknowledged by ${who}.`,
    metadata: { alert_id: alertId },
  });
  return { ticketId, acknowledgedAt: now, alreadyAcknowledged: false };
}

/**
 * Scheduled job (Vercel Cron): escalates unacknowledged alerts whose deadline
 * has passed to the next contact; marks the ticket exhausted when no contacts
 * remain and notifies management. Safe to run repeatedly.
 */
export async function runEscalationCheck(now = new Date()) {
  const db = adminClient();
  const settings = await loadSettings(db);
  const { data: tickets } = await db.from("tickets").select("id, building_id").eq("escalation_status", "alerting");
  const summary: { ticketId: string; action: string }[] = [];
  for (const t of tickets ?? []) {
    const { data: alerts } = await db
      .from("emergency_alerts")
      .select("id, contact_id, escalation_attempt, escalate_after, acknowledged_at")
      .eq("ticket_id", t.id)
      .order("escalation_attempt", { ascending: false });
    if (!alerts?.length) continue;
    if (alerts.some((a) => a.acknowledged_at)) {
      await db.from("tickets").update({ escalation_status: "acknowledged" }).eq("id", t.id);
      summary.push({ ticketId: t.id, action: "already_acknowledged" });
      continue;
    }
    const latestAttempt = alerts[0].escalation_attempt as number;
    const latest = alerts.filter((a) => a.escalation_attempt === latestAttempt);
    const deadline = Math.min(...latest.map((a) => new Date(a.escalate_after as string).getTime()));
    if (deadline > now.getTime()) {
      summary.push({ ticketId: t.id, action: "waiting" });
      continue;
    }
    const contacts = await contactsFor(db, t.building_id);
    const alerted = new Set(alerts.map((a) => a.contact_id));
    const next = contacts.find((c) => !alerted.has(c.id));
    if (!next) {
      await db.from("tickets").update({ escalation_status: "exhausted" }).eq("id", t.id);
      await db.from("ticket_events").insert({
        ticket_id: t.id,
        actor_label: "Emergency escalation",
        event_type: "emergency_exhausted",
        note: "All emergency contacts were alerted without acknowledgement. Management notified.",
      });
      await notifyManagementExhausted(db, await ticketContext(db, t.id));
      summary.push({ ticketId: t.id, action: "exhausted" });
      continue;
    }
    await alertContact(db, t.id, next, latestAttempt + 1, settings.emergency_ack_timeout_minutes);
    summary.push({ ticketId: t.id, action: `escalated_to_${next.contact_role}` });
  }
  return summary;
}
