import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { StudentShell } from "@/components/student/student-shell";
import { AckButton } from "@/components/student/ack-button";
import { adminClient } from "@/lib/supabase/admin";
import { hashToken, isWellFormedToken } from "@/lib/security/tokens";

export const metadata: Metadata = { title: "Acknowledge emergency", referrer: "no-referrer", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AckPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data } = isWellFormedToken(token)
    ? await adminClient()
        .from("emergency_alerts")
        .select("acknowledged_at, acknowledged_by, tickets(ticket_number, title, safety_reason, buildings(name), locations(area_name, floor))")
        .eq("ack_token_hash", hashToken(token))
        .maybeSingle()
    : { data: null };
  const alert = data as unknown as {
    acknowledged_at: string | null;
    acknowledged_by: string | null;
    tickets: { ticket_number: string; title: string; safety_reason: string | null; buildings: { name: string }; locations: { area_name: string; floor: number } };
  } | null;

  return (
    <StudentShell>
      {!alert ? (
        <p className="rounded-xl bg-card p-5 surface">This acknowledgement link is not valid.</p>
      ) : (
        <div className="rounded-xl bg-card p-5 surface">
          <div className="flex items-center gap-2 text-[#dc2626]">
            <ShieldAlert className="size-5" aria-hidden />
            <h1 className="font-semibold">Safety alert {alert.tickets.ticket_number}</h1>
          </div>
          <p className="mt-2 font-medium">{alert.tickets.title}</p>
          <p className="text-sm text-muted-foreground">
            {alert.tickets.buildings.name}, floor {alert.tickets.locations.floor}, {alert.tickets.locations.area_name}
          </p>
          {alert.tickets.safety_reason ? <p className="mt-3 text-sm">{alert.tickets.safety_reason}</p> : null}
          {alert.acknowledged_at ? (
            <p className="mt-4 rounded-xl bg-[#f0fdf4] p-3 text-sm text-[#15803d]">Already acknowledged{alert.acknowledged_by ? ` by ${alert.acknowledged_by}` : ""}.</p>
          ) : (
            <AckButton token={token} />
          )}
        </div>
      )}
    </StudentShell>
  );
}
