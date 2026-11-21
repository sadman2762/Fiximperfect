import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { submitReport, type SubmitReportResult } from "@/lib/workflows/report-intake";
import { changeStatus } from "@/lib/tickets/service";
import { submitFeedback } from "@/lib/workflows/resolution";
import { runEscalationCheck } from "@/lib/workflows/emergency";
import { loadAssetStats, deterministicRecommendation } from "@/lib/assets/intelligence";
import type { StaffProfile } from "@/types/domain";

/**
 * Repeatable demonstration scenarios. They call exactly the same services as
 * the real UI/API (report intake, ticket service, feedback, escalation), and
 * write to the database. Student feedback is submitted through the secure
 * feedback-token path, using the links from the simulated email outbox.
 */

export const SCENARIO_1_REPORTS = [
  { name: "Student A (demo)", email: "student.a@students.fiximperfect.example", description: "The washing machine door is broken." },
  { name: "Student B (demo)", email: "student.b@students.fiximperfect.example", description: "Washer number 3 will not close." },
  { name: "Student C (demo)", email: "student.c@students.fiximperfect.example", description: "The laundry machine door latch seems damaged." },
];

export async function scenarioDuplicateDetection() {
  const results: SubmitReportResult[] = [];
  for (const r of SCENARIO_1_REPORTS) {
    results.push(
      await submitReport({ qrSlug: "kossuth-b-floor2-washer03", description: r.description, reporterName: r.name, reporterEmail: r.email, isDemo: true }),
    );
  }
  const ticketIds = [...new Set(results.map((r) => r.ticketId))];
  return {
    scenario: "duplicate_detection",
    reports: results.map((r) => ({ report: r.reportNumber, ticket: r.ticketNumber, link: r.linkStatus, aiMode: r.aiMode })),
    uniqueTickets: ticketIds.length,
    ticketId: ticketIds[0],
    passed: ticketIds.length === 1 && results.length === 3,
  };
}

export async function scenarioSafetyEscalation() {
  const r = await submitReport({
    qrSlug: "kossuth-b-floor1-corridor",
    description: "There is water near an electrical socket.",
    reporterName: "Student D (demo)",
    reporterEmail: "student.d@students.fiximperfect.example",
    isDemo: true,
  });
  const db = adminClient();
  const { data: alerts } = await db.from("emergency_alerts").select("channel, delivery_status, recipient_name, escalation_attempt").eq("ticket_id", r.ticketId);
  const { data: ticket } = await db.from("tickets").select("priority, safety_level, escalation_status").eq("id", r.ticketId).single();
  return {
    scenario: "safety_escalation",
    ticket: r.ticketNumber,
    ticketId: r.ticketId,
    priority: ticket?.priority,
    safetyLevel: ticket?.safety_level,
    escalationStatus: ticket?.escalation_status,
    alerts: alerts ?? [],
    passed: ticket?.safety_level === "critical" && ticket?.priority === "critical" && (alerts?.length ?? 0) > 0,
  };
}

/** Simulates the acknowledgement deadline passing and runs the scheduled check. */
export async function scenarioEscalationTimeout(ticketId: string) {
  const db = adminClient();
  await db.from("emergency_alerts").update({ escalate_after: new Date(Date.now() - 1000).toISOString() }).eq("ticket_id", ticketId).is("acknowledged_at", null);
  return runEscalationCheck();
}

async function demoCaretaker(): Promise<StaffProfile> {
  const { data } = await adminClient().from("profiles").select("id, full_name, email, phone, role, building_access, is_active").eq("email", "caretaker@fiximperfect.example").single();
  if (!data) throw new Error("Demo caretaker missing — run the demo seed first.");
  return data as StaffProfile;
}

/** Extracts feedback tokens from simulated outbox emails (demo mode only). */
export async function feedbackTokensFromOutbox(ticketId: string): Promise<Map<string, string>> {
  const { data } = await adminClient()
    .from("notifications")
    .select("recipient, body_preview, delivery_status")
    .eq("ticket_id", ticketId)
    .eq("notification_type", "resolution_confirmation_request")
    .order("created_at", { ascending: false });
  const map = new Map<string, string>();
  for (const n of data ?? []) {
    if (n.delivery_status !== "simulated") continue;
    const m = /\/feedback\/([A-Za-z0-9_-]{32,128})/.exec(n.body_preview ?? "");
    if (m && !map.has(n.recipient)) map.set(n.recipient, m[1]);
  }
  return map;
}

export async function scenarioResolutionVerification(ticketId?: string) {
  const db = adminClient();
  let id = ticketId;
  if (!id) {
    const { data } = await db
      .from("tickets")
      .select("id, assets!inner(asset_code)")
      .eq("assets.asset_code", "WASHER-003")
      .not("status", "in", "(closed)")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    id = data?.id ?? (await scenarioDuplicateDetection()).ticketId;
  }
  const caretaker = await demoCaretaker();
  const { data: t } = await db.from("tickets").select("status").eq("id", id).single();
  if (t?.status === "assigned" || t?.status === "reopened") await changeStatus(caretaker, id!, "in_progress", "Technician on site (demo).");
  await changeStatus(caretaker, id!, "resolved", "Door latch replaced (demo).");

  const tokens = await feedbackTokensFromOutbox(id!);
  if (tokens.size < 3) {
    return { scenario: "resolution_verification", passed: false, error: "Feedback links unavailable: email provider is live, so links are only in real inboxes." };
  }
  const [a, b, c] = SCENARIO_1_REPORTS.map((r) => tokens.get(r.email));
  const r1 = await submitFeedback(a!, "fixed");
  const r2 = await submitFeedback(b!, "fixed");
  const r3 = await submitFeedback(c!, "still_broken", "The door still pops open mid-cycle.");
  const { data: after } = await db.from("tickets").select("ticket_number, status, reopened_count, resolution_verified").eq("id", id).single();
  const { data: fb } = await db.from("resolution_feedback").select("reporter_email, response").eq("ticket_id", id);
  return {
    scenario: "resolution_verification",
    ticket: after?.ticket_number,
    ticketId: id,
    responses: [r1, r2, r3],
    feedback: fb,
    status: after?.status,
    reopenedCount: after?.reopened_count,
    verified: after?.resolution_verified,
    passed: after?.status === "reopened" && after?.resolution_verified === false && (fb?.filter((f) => f.response === "fixed").length ?? 0) === 2,
  };
}

export async function scenarioPredictiveMaintenance() {
  const db = adminClient();
  const { data: asset } = await db.from("assets").select("id").eq("asset_code", "WASHER-001").single();
  const [s] = await loadAssetStats(db, asset!.id);
  return {
    scenario: "predictive_maintenance",
    asset: s.asset_name,
    failures60d: s.failures_60d,
    cumulativeRepairCost: s.cumulative_repair_cost,
    replacementCost: s.replacement_cost,
    ratio: s.repair_to_replacement_ratio,
    flagged: s.replacement_review,
    recommendation: deterministicRecommendation(s),
    passed: s.replacement_review && s.repair_to_replacement_ratio === 110.5,
  };
}
