import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ImageIcon, MapPin, ShieldAlert } from "lucide-react";
import { requireStaffPage, canCoordinateTicket, canManageTicket, teamIdsFor } from "@/lib/auth/session";
import { sessionClient } from "@/lib/supabase/server";
import { sumMoney } from "@/lib/validations/schemas";
import { AiModeBadge, DeliveryBadge, PriorityBadge, SafetyBadge, StatusBadge } from "@/components/shared/badges";
import { PageHeader, formatDate } from "@/components/shared/ui-bits";
import { AiAnalysisPanel } from "@/components/tickets/ai-analysis-panel";
import { AssignmentControls, CostForm, DuplicateReviewControls, NoteForm, PriorityControls, StatusControls } from "@/components/tickets/ticket-controls";
import { AcknowledgeButton } from "@/components/tickets/acknowledge-button";
import { LiveRefresh } from "@/components/dashboard/live-refresh";
import type { TicketRow } from "@/types/domain";
import { placeName } from "@/lib/locations/label";

export const metadata: Metadata = { title: "Ticket" };

function Card({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-card p-5 surface">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

const EVENT_LABEL: Record<string, string> = {
  ticket_created: "Ticket created",
  status_changed: "Status changed",
  report_linked: "Report linked",
  team_assigned: "Team assigned",
  team_unassigned: "Team removed",
  staff_assigned: "Person assigned",
  staff_unassigned: "Person removed",
  priority_changed: "Priority changed",
  note: "Note",
  cost_recorded: "Expense recorded",
  safety_escalated: "Safety escalated",
  emergency_alert_sent: "Emergency alert sent",
  emergency_escalated: "Emergency escalated",
  emergency_acknowledged: "Emergency acknowledged",
  emergency_exhausted: "Escalation exhausted",
  emergency_no_contacts: "No emergency contacts",
  feedback_requested: "Student confirmation requested",
  feedback_positive: "Student confirmed fix",
  feedback_negative: "Student says still broken",
  student_verified: "Student-verified resolution",
  possible_duplicate: "Possible duplicate flagged",
  duplicate_rejected: "Duplicate rejected by caretaker",
  tickets_merged: "Tickets merged",
  merged_into: "Merged into another ticket",
};

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await sessionClient();
  const { data: t } = await db
    .from("tickets")
    .select("*, buildings(name), locations(area_name, floor, room_number), assets(id, asset_name, asset_code, currency), maintenance_teams(team_name), profiles:assigned_to(full_name)")
    .eq("id", id)
    .maybeSingle();
  if (!t) notFound();
  const ticket = t as TicketRow & {
    buildings: { name: string };
    locations: { area_name: string; floor: number; room_number: string | null };
    assets: { id: string; asset_name: string; asset_code: string; currency: string } | null;
    maintenance_teams: { team_name: string } | null;
    profiles: { full_name: string } | null;
  };

  const [reports, events, costs, feedback, alerts, notifications, teams, people] = await Promise.all([
    db.from("reports").select("id, report_number, reporter_name, reporter_email, description, additional_details, image_path, ai_analysis, link_status, duplicate_confidence, duplicate_reason, suggested_ticket_id, created_at").eq("ticket_id", id).order("created_at"),
    db.from("ticket_events").select("id, actor_label, event_type, old_value, new_value, note, created_at").eq("ticket_id", id).order("created_at", { ascending: false }),
    db.from("maintenance_costs").select("id, parts_cost, labour_cost, other_cost, total_cost, currency, expense_date, notes").eq("ticket_id", id).order("expense_date"),
    db.from("resolution_feedback").select("id, reporter_email, response, comment, created_at, responded_at, expires_at, resolution_event_id").eq("ticket_id", id).order("created_at", { ascending: false }),
    db.from("emergency_alerts").select("id, recipient_name, recipient, channel, delivery_status, escalation_attempt, acknowledged_at, acknowledged_by, escalate_after, created_at, error_message").eq("ticket_id", id).order("created_at"),
    db.from("notifications").select("id, audience, recipient, channel, notification_type, delivery_status, created_at, error_message").eq("ticket_id", id).order("created_at", { ascending: false }).limit(40),
    db.from("maintenance_teams").select("id, team_name").order("team_name"),
    db.from("profiles").select("id, full_name, role, building_access").in("role", ["maintenance_staff", "caretaker"]).eq("is_active", true),
  ]);
  const reportRows = reports.data ?? [];
  const suggestedId = reportRows.find((r) => r.suggested_ticket_id)?.suggested_ticket_id ?? null;
  const { data: suggested } = suggestedId ? await db.from("tickets").select("id, ticket_number, title").eq("id", suggestedId).maybeSingle() : { data: null };

  const coordinator = canCoordinateTicket(staff, ticket);
  const manager = canManageTicket(staff, ticket, staff.role === "maintenance_staff" ? await teamIdsFor(staff.id) : []);
  const costTotals = new Map<string, string>();
  for (const c of costs.data ?? []) costTotals.set(c.currency, sumMoney(costTotals.get(c.currency) ?? "0", String(c.total_cost)));
  const uniqueReporters = new Set(reportRows.map((r) => r.reporter_email.toLowerCase())).size;
  const latestResolution = (feedback.data ?? [])[0]?.resolution_event_id;
  const currentFeedback = (feedback.data ?? []).filter((f) => f.resolution_event_id === latestResolution);
  // Team assignment events may store a team id; show the team's name instead.
  const teamName = (v: string | null) => (teams.data ?? []).find((t) => t.id === v)?.team_name ?? v;
  const openAlert = ticket.safety_level === "critical" && ["pending", "alerting", "exhausted"].includes(ticket.escalation_status);

  return (
    <>
      <LiveRefresh />
      <Link href="/tickets" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Tickets
      </Link>
      <PageHeader
        title={`${ticket.ticket_number} · ${ticket.title}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
            <SafetyBadge level={ticket.safety_level} />
            <AiModeBadge mode={ticket.ai_mode} />
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden />
              {ticket.buildings.name} · Floor {ticket.locations.floor} · {placeName(ticket.locations)}
            </span>
            {ticket.assets ? (
              <Link href={`/assets/${ticket.assets.id}`} className="text-[#00866a] hover:underline">
                {ticket.assets.asset_name} ({ticket.assets.asset_code})
              </Link>
            ) : null}
          </span>
        }
      />

      {openAlert ? (
        <div className="mb-4 flex items-center gap-3 rounded-xl bg-[#dc2626] p-5 text-white">
          <ShieldAlert className="size-5" aria-hidden />
          <p className="flex-1 text-sm">
            <strong>Critical safety issue.</strong> {ticket.safety_reason} Escalation status: {ticket.escalation_status}.
          </p>
          {coordinator ? <AcknowledgeButton ticketId={ticket.id} /> : null}
        </div>
      ) : null}

      {ticket.status === "needs_review" && ticket.needs_review_reason ? (
        <div className="mb-4 rounded-xl bg-[#f1efff] p-4 ring-1 ring-[#d9d4ff]">
          <p className="text-sm font-medium text-[#5b4fd0]">Needs caretaker review</p>
          <p className="mt-1 text-sm text-[#5b4fd0]">{ticket.needs_review_reason}</p>
          {coordinator && reportRows.some((r) => r.link_status === "pending_review") ? (
            <div className="mt-3">
              <DuplicateReviewControls ticketId={ticket.id} suggested={suggested ?? null} />
            </div>
          ) : null}
        </div>
      ) : null}
      {ticket.merged_into ? (
        <p className="mb-4 rounded-xl bg-[#eef2f3] p-3 text-sm">
          This ticket was merged.{" "}
          <Link className="text-[#00866a] underline" href={`/tickets/${ticket.merged_into}`}>
            Open the surviving ticket
          </Link>
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title={`Linked reports (${reportRows.length} report${reportRows.length === 1 ? "" : "s"} from ${uniqueReporters} student${uniqueReporters === 1 ? "" : "s"})`}>
            <ol className="space-y-4">
              {reportRows.map((r) => (
                <li key={r.id} className="rounded-xl bg-[#f8fafa] p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm">
                      <span className="font-mono text-xs">{r.report_number}</span> · <strong>{r.reporter_name}</strong> <span className="text-muted-foreground">{r.reporter_email}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(r.created_at)} ·{" "}
                      {r.link_status === "auto_linked" ? `auto-linked (${Math.round(Number(r.duplicate_confidence) * 100)}%)` : (r.link_status ?? "").replace(/_/g, " ")}
                    </p>
                  </div>
                  <p className="mt-2 text-sm">{r.description}</p>
                  {r.additional_details ? <p className="mt-1 text-sm text-muted-foreground">{r.additional_details}</p> : null}
                  {r.image_path ? (
                    <a href={`/api/reports/${r.id}/image`} target="_blank" rel="noreferrer" className="mt-2 block w-fit">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/reports/${r.id}/image`} alt={`Photo from ${r.report_number}`} className="max-h-60 rounded-xl surface" />
                    </a>
                  ) : (
                    <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <ImageIcon className="size-3.5" aria-hidden /> No photo
                    </p>
                  )}
                  <details className="mt-3" open={reportRows.length === 1 || r === reportRows[reportRows.length - 1]}>
                    <summary className="cursor-pointer text-xs font-medium text-[#00866a]">AI analysis &amp; reasoning</summary>
                    <div className="mt-2">
                      <AiAnalysisPanel analysis={r.ai_analysis} />
                    </div>
                  </details>
                </li>
              ))}
            </ol>
          </Card>

          <Card title="History">
            <NoteForm ticketId={ticket.id} />
            <ol className="mt-5 space-y-3.5">
              {(events.data ?? []).map((e) => (
                <li key={e.id} className="relative pl-6 text-sm before:absolute before:top-[7px] before:left-[3px] before:size-2 before:rounded-full before:bg-[#c9d1d6] after:absolute after:top-4 after:bottom-[-14px] after:left-[6.5px] after:w-px after:bg-white/10 last:after:hidden">
                  <p>
                    <strong>{EVENT_LABEL[e.event_type] ?? e.event_type}</strong>
                    {e.old_value || e.new_value ? (
                      <span className="text-muted-foreground">
                        {" "}
                        {e.old_value ? `${teamName(e.old_value)} → ` : ""}
                        {teamName(e.new_value)}
                      </span>
                    ) : null}
                  </p>
                  {e.note ? <p className="text-muted-foreground">{e.note}</p> : null}
                  <p className="text-xs text-muted-foreground">
                    {e.actor_label} · {formatDate(e.created_at)}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-4">
          {manager ? (
            <Card title="Status">
              <StatusControls ticketId={ticket.id} status={ticket.status} coordinator={coordinator} verified={ticket.resolution_verified} />
            </Card>
          ) : null}
          <Card title="Assignment">
            <p className="mb-2 text-sm">
              {ticket.maintenance_teams?.team_name ?? "No team"} {ticket.profiles ? `· ${ticket.profiles.full_name}` : ""}
            </p>
            {ticket.routing_reason ? <p className="mb-3 text-xs text-muted-foreground">Routing: {ticket.routing_reason}</p> : null}
            {coordinator ? (
              <AssignmentControls
                ticketId={ticket.id}
                teams={teams.data ?? []}
                people={(people.data ?? []).filter((p) => (p.building_access as string[]).includes(ticket.building_id))}
                teamId={ticket.assigned_team_id}
                assigneeId={ticket.assigned_to}
              />
            ) : null}
          </Card>
          <Card title="Priority">
            <p className="mb-2 text-xs text-muted-foreground">{ticket.priority_reason}</p>
            {coordinator ? <PriorityControls ticketId={ticket.id} priority={ticket.priority} critical={ticket.safety_level === "critical"} /> : <PriorityBadge priority={ticket.priority} />}
          </Card>
          <Card title="Student verification">
            {currentFeedback.length ? (
              <>
                <p className="mb-2 text-sm">
                  {ticket.resolution_verified ? "✅ Student-verified" : `${currentFeedback.filter((f) => f.response === "fixed").length} of ${currentFeedback.length} confirmed`}
                  {ticket.reopened_count ? ` · reopened ${ticket.reopened_count}×` : ""}
                </p>
                <ul className="space-y-1.5 text-sm">
                  {currentFeedback.map((f) => (
                    <li key={f.id} className="flex justify-between gap-2">
                      <span className="truncate">{f.reporter_email}</span>
                      <span className={f.response === "fixed" ? "text-[#006b55]" : f.response === "still_broken" ? "text-[#dc2626]" : "text-muted-foreground"}>
                        {f.response === "fixed" ? "Fixed" : f.response === "still_broken" ? "Still broken" : "Awaiting"}
                      </span>
                    </li>
                  ))}
                </ul>
                {currentFeedback.some((f) => f.comment) ? (
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {currentFeedback.filter((f) => f.comment).map((f) => <li key={f.id}>“{f.comment}”</li>)}
                  </ul>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Requests are sent to every reporting student when the ticket is marked resolved.</p>
            )}
          </Card>
          <Card title="Repair costs">
            {(costs.data ?? []).length ? (
              <ul className="mb-3 space-y-1 text-sm">
                {(costs.data ?? []).map((c) => (
                  <li key={c.id} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">
                      {c.expense_date} · parts {c.parts_cost} + labour {c.labour_cost} + other {c.other_cost}
                    </span>
                    <span className="tabular-nums">
                      {c.total_cost} {c.currency}
                    </span>
                  </li>
                ))}
                {[...costTotals].map(([cur, total]) => (
                  <li key={cur} className="flex justify-between border-t pt-1 font-medium">
                    <span>Total ({cur})</span>
                    <span className="tabular-nums">
                      {total} {cur}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-3 text-sm text-muted-foreground">No expenses recorded.</p>
            )}
            {manager ? <CostForm ticketId={ticket.id} currency={ticket.assets?.currency ?? "EUR"} /> : null}
          </Card>
          {(alerts.data ?? []).length ? (
            <Card title="Emergency alerts">
              <ul className="space-y-2 text-sm">
                {(alerts.data ?? []).map((a) => (
                  <li key={a.id} className="rounded-xl bg-[#f8fafa] p-3">
                    <p>
                      Attempt {a.escalation_attempt} · {a.recipient_name} · {a.channel}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <DeliveryBadge status={a.delivery_status} />
                      {a.acknowledged_at ? <span className="text-[#006b55]">Acknowledged {formatDate(a.acknowledged_at)}</span> : <span className="text-muted-foreground">Escalates after {formatDate(a.escalate_after)}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          <Card title={`Notifications (${(notifications.data ?? []).length})`}>
            <ul className="space-y-2.5 text-xs">
              {(notifications.data ?? []).slice(0, 6).map((n) => (
                <li key={n.id} className="flex flex-col items-start gap-1">
                  <span className="text-[13px]">
                    {n.notification_type.replace(/_/g, " ")} <span className="text-muted-foreground">→ {n.recipient}</span>
                  </span>
                  <DeliveryBadge status={n.delivery_status} />
                </li>
              ))}
            </ul>
            {(notifications.data ?? []).length > 6 ? (
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer font-medium text-[#00866a]">Show {(notifications.data ?? []).length - 6} more</summary>
                <ul className="mt-2 space-y-2.5">
                  {(notifications.data ?? []).slice(6).map((n) => (
                    <li key={n.id} className="flex flex-col items-start gap-1">
                      <span className="text-[13px]">
                        {n.notification_type.replace(/_/g, " ")} <span className="text-muted-foreground">→ {n.recipient}</span>
                      </span>
                      <DeliveryBadge status={n.delivery_status} />
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </Card>
        </div>
      </div>
    </>
  );
}
