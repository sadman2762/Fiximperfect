import Link from "next/link";
import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { requireStaffPage } from "@/lib/auth/session";
import { sessionClient } from "@/lib/supabase/server";
import { loadOverview } from "@/lib/analytics/queries";
import { listTickets } from "@/lib/tickets/queries";
import { PageHeader, StatTile, formatDate, formatHours } from "@/components/shared/ui-bits";
import { TicketTable } from "@/components/tickets/ticket-table";
import { LiveRefresh } from "@/components/dashboard/live-refresh";
import { AcknowledgeButton } from "@/components/tickets/acknowledge-button";
import { buttonVariants } from "@/components/ui/button";
import { placeName } from "@/lib/locations/label";

export const metadata: Metadata = { title: "Overview" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/Budapest" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const staff = await requireStaffPage();
  const { denied } = await searchParams;
  const db = await sessionClient();
  const [o, attention, { data: emergencies }] = await Promise.all([
    loadOverview(db),
    listTickets(db, { status: "active", sort: "priority", dir: "desc" }),
    db
      .from("tickets")
      .select("id, ticket_number, title, escalation_status, created_at, safety_reason, buildings(name), locations(area_name, floor, room_number), emergency_alerts(recipient_name, channel, delivery_status, escalation_attempt, acknowledged_at, created_at)")
      .eq("safety_level", "critical")
      .in("escalation_status", ["pending", "alerting", "exhausted"])
      .order("created_at", { ascending: false }),
  ]);
  type Emergency = {
    id: string;
    ticket_number: string;
    title: string;
    escalation_status: string;
    created_at: string;
    safety_reason: string | null;
    buildings: { name: string };
    locations: { area_name: string; floor: number; room_number: string | null };
    emergency_alerts: { recipient_name: string | null; channel: string; delivery_status: string; escalation_attempt: number; acknowledged_at: string | null; created_at: string }[];
  };
  const canAck = staff.role === "caretaker" || staff.role === "administrator";

  return (
    <>
      <LiveRefresh />
      <PageHeader
        title={`${greeting()}, ${staff.full_name.split(" ")[0]}`}
        description="Live overview of maintenance across your buildings."
        actions={
          <Link href="/tickets" className={buttonVariants({ variant: "outline" })}>
            All tickets
          </Link>
        }
      />
      {denied ? <p className="mb-4 rounded-xl bg-[#fff7ed] p-3 text-sm text-[#b45309]">You do not have access to that page.</p> : null}

      {(emergencies as unknown as Emergency[] | null)?.length ? (
        <section aria-label="Active emergencies" className="mb-6 space-y-3">
          {(emergencies as unknown as Emergency[]).map((e) => {
            const latest = [...e.emergency_alerts].sort((a, b) => b.escalation_attempt - a.escalation_attempt)[0];
            return (
              <div key={e.id} className="flex flex-col gap-3 rounded-xl bg-gradient-to-br from-[#ff453a] to-[#d70015] p-5 text-white shadow-[0_16px_40px_-16px_rgba(215,0,21,0.65)] sm:flex-row sm:items-center">
                <ShieldAlert className="size-6 shrink-0" aria-hidden />
                <div className="flex-1 text-sm">
                  <p className="font-semibold">
                    Safety emergency {e.ticket_number}: {e.title}
                  </p>
                  <p className="opacity-90">
                    {e.buildings.name} · Floor {e.locations.floor} · {placeName(e.locations)} · reported {formatDate(e.created_at)}
                  </p>
                  <p className="mt-1 opacity-90">
                    {e.escalation_status === "exhausted"
                      ? "All emergency contacts alerted without acknowledgement — management notified."
                      : latest
                        ? `Escalation attempt ${latest.escalation_attempt}: ${latest.recipient_name} alerted (${e.emergency_alerts.filter((a) => a.escalation_attempt === latest.escalation_attempt).map((a) => `${a.channel} ${a.delivery_status}`).join(", ")}). Awaiting acknowledgement.`
                        : "Alerting contacts…"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link href={`/tickets/${e.id}`} className="rounded-xl bg-white/15 px-3 py-1.5 text-sm font-medium hover:bg-white/25">
                    Open
                  </Link>
                  {canAck ? <AcknowledgeButton ticketId={e.id} /> : null}
                </div>
              </div>
            );
          })}
        </section>
      ) : null}

      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <StatTile label="Active tickets" value={o.active_tickets} />
        <StatTile label="Critical" value={o.critical_active} tone={o.critical_active ? "critical" : "default"} />
        <StatTile label="High priority" value={o.high_active} tone={o.high_active ? "warning" : "default"} />
        <StatTile label="Unassigned" value={o.unassigned_active} hint={`${o.needs_review} need review`} />
        <StatTile label="In progress" value={o.in_progress} />
        <StatTile label="Avg. resolution" value={formatHours(o.avg_resolution_hours)} />
        <StatTile label="Reopened" value={o.reopened_tickets} hint={`${o.reopened_active} currently open`} />
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-semibold">Active tickets by urgency</h2>
          <p className="text-xs text-muted-foreground">
            {o.total_reports} reports → {o.unique_tickets} unique tickets ({o.duplicate_report_rate}% duplicates linked)
          </p>
        </div>
        <TicketTable rows={attention.rows.slice(0, 12)} />
      </section>
    </>
  );
}
