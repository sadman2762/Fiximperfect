import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { canCoordinateTicket, canManageTicket, teamIdsFor } from "@/lib/auth/permissions";
import { HttpError } from "@/lib/errors";
import { canTransition, COORDINATOR_ONLY, STUDENT_NOTIFY_STATUSES, STATUS_LABELS } from "@/lib/tickets/state-machine";
import { requestResolutionFeedback } from "@/lib/workflows/resolution";
import { sendNotification } from "@/lib/notifications/dispatcher";
import { statusUpdate, staffTicketAlert } from "@/lib/notifications/templates";
import { issueTrackingLink, studentEmailContext, teamMembersFor, ticketUrl } from "@/lib/notifications/recipients";
import type { Priority, StaffProfile, TicketRow, TicketStatus } from "@/types/domain";

async function loadTicket(ticketId: string): Promise<TicketRow> {
  const { data } = await adminClient().from("tickets").select("*").eq("id", ticketId).maybeSingle();
  if (!data) throw new HttpError(404, "Ticket not found");
  return data as TicketRow;
}

async function audit(staff: StaffProfile, action: string, entityId: string, details: unknown) {
  await adminClient().from("audit_logs").insert({
    actor_id: staff.id,
    actor_label: staff.full_name,
    action,
    entity_type: "ticket",
    entity_id: entityId,
    details,
  });
}

async function assertCanManage(staff: StaffProfile, ticket: TicketRow) {
  const teams = staff.role === "maintenance_staff" ? await teamIdsFor(staff.id) : [];
  if (!canManageTicket(staff, ticket, teams)) throw new HttpError(403, "You are not allowed to modify this ticket");
}

function assertCanCoordinate(staff: StaffProfile, ticket: TicketRow) {
  if (!canCoordinateTicket(staff, ticket)) throw new HttpError(403, "Only caretakers of this building or administrators can do this");
}

/** Notifies every unique reporter of a student-relevant status change. */
async function notifyReporters(ticket: TicketRow, status: TicketStatus, note?: string | null) {
  const db = adminClient();
  const { data: reports } = await db.from("reports").select("id, reporter_email").eq("ticket_id", ticket.id).order("created_at");
  const seen = new Set<string>();
  for (const r of reports ?? []) {
    const email = r.reporter_email.toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    const link = await issueTrackingLink(db, r.id);
    const ctx = await studentEmailContext(db, r.id, link);
    const tpl = statusUpdate({ ...ctx, status, note });
    await sendNotification({ audience: "student", channel: "email", recipient: email, type: `status_${status}`, ...tpl, secureLinks: [link], ticketId: ticket.id, reportId: r.id });
  }
}

export async function changeStatus(staff: StaffProfile, ticketId: string, to: TicketStatus, note?: string | null, expected?: TicketStatus) {
  const ticket = await loadTicket(ticketId);
  await assertCanManage(staff, ticket);
  if (COORDINATOR_ONLY.includes(to)) assertCanCoordinate(staff, ticket);
  if (expected && expected !== ticket.status) throw new HttpError(409, `Ticket is now "${STATUS_LABELS[ticket.status]}". Refresh and try again.`);
  if (!canTransition(ticket.status, to)) {
    throw new HttpError(422, `Cannot move a ticket from "${STATUS_LABELS[ticket.status]}" to "${STATUS_LABELS[to]}".`);
  }
  if (to === "closed" && ticket.status === "resolved" && !ticket.resolution_verified && !note) {
    throw new HttpError(422, "This resolution is not student-verified yet. Add a note explaining why it is being closed.");
  }
  const { data: eventId, error } = await adminClient().rpc("apply_ticket_transition", {
    p_ticket_id: ticketId,
    p_expected_status: ticket.status,
    p_new_status: to,
    p_actor_id: staff.id,
    p_actor_label: staff.full_name,
    p_note: note ?? null,
    p_metadata: null,
  });
  if (error) {
    if (error.message.includes("status_conflict")) throw new HttpError(409, "The ticket changed in the meantime. Refresh and try again.");
    throw new HttpError(422, error.message);
  }
  await audit(staff, "ticket.status", ticketId, { from: ticket.status, to, note });
  const updated = { ...ticket, status: to };
  if (to === "resolved") {
    await requestResolutionFeedback(ticketId, eventId as string);
  } else if (STUDENT_NOTIFY_STATUSES.includes(to)) {
    await notifyReporters(updated, to, to === "waiting_for_parts" ? note : null);
  }
  return { eventId, status: to };
}

export async function assignTicket(staff: StaffProfile, ticketId: string, input: { teamId?: string | null; assigneeId?: string | null; note?: string | null }) {
  const ticket = await loadTicket(ticketId);
  assertCanCoordinate(staff, ticket);
  const db = adminClient();
  const patch: Partial<TicketRow> = {};
  const events: { event_type: string; old_value: string | null; new_value: string | null; note: string | null }[] = [];

  if (input.teamId !== undefined) {
    if (input.teamId) {
      const { data: team } = await db.from("maintenance_teams").select("id, team_name").eq("id", input.teamId).maybeSingle();
      if (!team) throw new HttpError(422, "Unknown maintenance team");
      events.push({ event_type: "team_assigned", old_value: ticket.assigned_team_id, new_value: team.team_name, note: input.note ?? null });
    } else {
      events.push({ event_type: "team_unassigned", old_value: ticket.assigned_team_id, new_value: null, note: input.note ?? null });
    }
    patch.assigned_team_id = input.teamId;
  }
  if (input.assigneeId !== undefined) {
    if (input.assigneeId) {
      const { data: person } = await db.from("profiles").select("id, full_name, role, building_access, is_active").eq("id", input.assigneeId).maybeSingle();
      if (!person || !person.is_active || !["maintenance_staff", "caretaker"].includes(person.role)) throw new HttpError(422, "That person cannot be assigned");
      if (!(person.building_access as string[]).includes(ticket.building_id)) throw new HttpError(422, `${person.full_name} has no access to this building`);
      events.push({ event_type: "staff_assigned", old_value: ticket.assigned_to, new_value: person.full_name, note: input.note ?? null });
    } else {
      events.push({ event_type: "staff_unassigned", old_value: ticket.assigned_to, new_value: null, note: input.note ?? null });
    }
    patch.assigned_to = input.assigneeId;
  }
  const { error } = await db.from("tickets").update(patch).eq("id", ticketId);
  if (error) throw new HttpError(422, error.message);
  if (events.length) {
    await db.from("ticket_events").insert(events.map((e) => ({ ...e, ticket_id: ticketId, actor_id: staff.id, actor_label: staff.full_name })));
  }
  await audit(staff, "ticket.assign", ticketId, input);

  const hasAssignment = (patch.assigned_team_id ?? ticket.assigned_team_id) || (patch.assigned_to ?? ticket.assigned_to);
  if (hasAssignment && ["submitted", "needs_review", "reopened"].includes(ticket.status)) {
    await changeStatus(staff, ticketId, "assigned", input.note ?? "Assigned by caretaker.");
  }
  // Tell the newly assigned team.
  if (patch.assigned_team_id) {
    for (const m of await teamMembersFor(db, patch.assigned_team_id)) {
      const tpl = staffTicketAlert({ kind: "Assigned to your team", ticketNumber: ticket.ticket_number, title: ticket.title, location: "", detail: `Priority: ${ticket.priority}.`, url: ticketUrl(ticketId) });
      await sendNotification({ audience: "team", channel: "email", recipient: m.email, type: "team_assignment", ...tpl, ticketId });
    }
  }
  return { ok: true };
}

export async function changePriority(staff: StaffProfile, ticketId: string, priority: Priority, reason: string) {
  const ticket = await loadTicket(ticketId);
  assertCanCoordinate(staff, ticket);
  if (ticket.safety_level === "critical" && priority !== "critical") {
    // Human override of a critical safety decision is allowed but must be explicit and is audited.
    reason = `Safety override by ${staff.full_name}: ${reason}`;
  }
  const db = adminClient();
  await db.from("tickets").update({ priority, priority_reason: reason }).eq("id", ticketId);
  await db.from("ticket_events").insert({
    ticket_id: ticketId,
    actor_id: staff.id,
    actor_label: staff.full_name,
    event_type: "priority_changed",
    old_value: ticket.priority,
    new_value: priority,
    note: reason,
  });
  await audit(staff, "ticket.priority", ticketId, { from: ticket.priority, to: priority, reason });
  return { ok: true };
}

export async function addNote(staff: StaffProfile, ticketId: string, note: string) {
  const ticket = await loadTicket(ticketId);
  await assertCanManage(staff, ticket);
  await adminClient().from("ticket_events").insert({ ticket_id: ticketId, actor_id: staff.id, actor_label: staff.full_name, event_type: "note", note });
  return { ok: true };
}

export async function addCost(
  staff: StaffProfile,
  ticketId: string,
  c: { partsCost: string; labourCost: string; otherCost: string; currency: string; expenseDate: string; notes?: string | null },
) {
  const ticket = await loadTicket(ticketId);
  await assertCanManage(staff, ticket);
  const db = adminClient();
  // total_cost is a generated column: computed by the database, never by the client.
  const { data, error } = await db
    .from("maintenance_costs")
    .insert({
      ticket_id: ticketId,
      asset_id: ticket.asset_id,
      parts_cost: c.partsCost,
      labour_cost: c.labourCost,
      other_cost: c.otherCost,
      currency: c.currency,
      expense_date: c.expenseDate,
      notes: c.notes ?? null,
      recorded_by: staff.id,
    })
    .select("id, total_cost, currency")
    .single();
  if (error) throw new HttpError(422, error.message);
  await db.from("ticket_events").insert({
    ticket_id: ticketId,
    actor_id: staff.id,
    actor_label: staff.full_name,
    event_type: "cost_recorded",
    new_value: `${data.total_cost} ${data.currency}`,
    note: c.notes ?? null,
  });
  await audit(staff, "ticket.cost", ticketId, { ...c, total: data.total_cost });
  return data;
}

export async function mergeTickets(staff: StaffProfile, sourceId: string, targetId: string) {
  const source = await loadTicket(sourceId);
  assertCanCoordinate(staff, source);
  const { data, error } = await adminClient().rpc("merge_ticket_into", {
    p_source_ticket: sourceId,
    p_target_ticket: targetId,
    p_actor_id: staff.id,
    p_actor_label: staff.full_name,
  });
  if (error) throw new HttpError(422, error.message);
  await audit(staff, "ticket.merge", sourceId, { into: targetId });
  return data;
}

/** Caretaker decides a flagged possible duplicate is a separate problem. */
export async function keepSeparate(staff: StaffProfile, ticketId: string) {
  const ticket = await loadTicket(ticketId);
  assertCanCoordinate(staff, ticket);
  const db = adminClient();
  await db.from("reports").update({ link_status: "review_new_ticket", suggested_ticket_id: null }).eq("ticket_id", ticketId).eq("link_status", "pending_review");
  await db.from("tickets").update({ needs_review_reason: null }).eq("id", ticketId);
  await db.from("ticket_events").insert({
    ticket_id: ticketId,
    actor_id: staff.id,
    actor_label: staff.full_name,
    event_type: "duplicate_rejected",
    note: "Caretaker confirmed this is a separate problem.",
  });
  if (ticket.status === "needs_review" && ticket.assigned_team_id) await changeStatus(staff, ticketId, "assigned", "Reviewed by caretaker.");
  return { ok: true };
}

