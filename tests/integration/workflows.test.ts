import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { anonClient, assertStackUp, db, staffClient, staffProfile, tinyPng } from "../support/helpers";
import { seedDemo } from "@/lib/demo/seed";
import { resolveQr } from "@/lib/assets/qr";
import { submitReport } from "@/lib/workflows/report-intake";
import { changeStatus, addCost } from "@/lib/tickets/service";
import { requestResolutionFeedback, submitFeedback } from "@/lib/workflows/resolution";
import { runEscalationCheck, acknowledgeTicket } from "@/lib/workflows/emergency";
import { loadOverview } from "@/lib/analytics/queries";
import { loadAssetStats } from "@/lib/assets/intelligence";
import * as scenarios from "@/lib/demo/scenarios";
import { HttpError } from "@/lib/errors";

const CARETAKER = "caretaker@fiximperfect.example"; // Kossuth A + B
const RIVERSIDE = "caretaker.riverside@fiximperfect.example"; // Riverside only
const TECH = "appliance.tech@fiximperfect.example";
const MANAGER = "manager@fiximperfect.example";

beforeAll(async () => {
  await assertStackUp();
});

beforeEach(async () => {
  await seedDemo();
});

describe("QR resolution & student reporting", () => {
  it("resolves an asset QR to the correct building, floor, location and asset (server-side)", async () => {
    const qr = await resolveQr(db(), "kossuth-b-floor2-washer03");
    expect(qr).not.toBeNull();
    expect(qr!.kind).toBe("asset");
    expect(qr!.building.name).toBe("Kossuth Dorm B");
    expect(qr!.location.floor).toBe(2);
    expect(qr!.location.area_name).toBe("Laundry Room");
    expect(qr!.asset!.asset_code).toBe("WASHER-003");
    expect(qr!.asset!.asset_name).toBe("Washer #3");
  });

  it("resolves a location QR with its selectable assets, and rejects unknown slugs", async () => {
    const qr = await resolveQr(db(), "kossuth-b-floor2-kitchen");
    expect(qr!.kind).toBe("location");
    expect(qr!.locationAssets.map((a) => a.asset_code).sort()).toEqual(["FRIDGE-001", "OVEN-001"]);
    expect(await resolveQr(db(), "does-not-exist")).toBeNull();
    expect(await resolveQr(db(), "../../etc/passwd")).toBeNull();
  });

  it("accepts a report without staff authentication and returns a working tracking token", async () => {
    const r = await submitReport({ qrSlug: "kossuth-b-floor2-kitchen", description: "The fridge is warm", reporterName: "Test", reporterEmail: "t1@students.fiximperfect.example" });
    expect(r.reportNumber).toMatch(/^RPT-/);
    expect(r.ticketNumber).toMatch(/^MNT-/);
    expect(r.trackingUrl).toMatch(/\/track\/[A-Za-z0-9_-]{43}$/);
    const { data } = await db().from("reports").select("tracking_token_hash, asset_id, assets(asset_code)").eq("id", r.reportId).single();
    expect(data!.tracking_token_hash).toMatch(/^[0-9a-f]{64}$/); // only the hash is stored
    expect((data!.assets as unknown as { asset_code: string }).asset_code).toBe("FRIDGE-001"); // picked from the location's assets
  });

  it("stores photos in the private bucket, reachable only through signed URLs", async () => {
    const r = await submitReport({ qrSlug: "kossuth-b-floor2-washer03", description: "Door broken", reporterName: "P", reporterEmail: "p@students.fiximperfect.example", image: tinyPng() });
    const { data } = await db().from("reports").select("image_path").eq("id", r.reportId).single();
    expect(data!.image_path).toMatch(new RegExp(`^${r.reportId}/[0-9a-f-]+\\.png$`));
    const anonDownload = await anonClient().storage.from("report-images").download(data!.image_path!);
    expect(anonDownload.error).not.toBeNull();
    const signed = await db().storage.from("report-images").createSignedUrl(data!.image_path!, 60);
    const res = await fetch(signed.data!.signedUrl);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
  });

  it("rejects disguised images before anything is saved", async () => {
    const before = (await db().from("reports").select("id", { count: "exact", head: true })).count;
    await expect(
      submitReport({ qrSlug: "kossuth-b-floor2-washer03", description: "x x x", reporterName: "P", reporterEmail: "p@students.fiximperfect.example", image: new TextEncoder().encode("GIF-but-not-really-an-image") }),
    ).rejects.toThrow(/JPEG, PNG/);
    expect((await db().from("reports").select("id", { count: "exact", head: true })).count).toBe(before);
  });

  it("gives the anonymous key no direct access to any table", async () => {
    const anon = anonClient();
    for (const table of ["reports", "tickets", "profiles", "notifications", "resolution_feedback", "student_access_tokens"]) {
      const { data } = await anon.from(table).select("*").limit(1);
      expect(data ?? []).toHaveLength(0);
    }
    const rpc = await anon.rpc("attach_report_to_ticket", { p: {} });
    expect(rpc.error).not.toBeNull();
  });
});

describe("duplicate detection", () => {
  it("links three reports about Washer #3 to one ticket and keeps every report", async () => {
    const s = await scenarios.scenarioDuplicateDetection();
    expect(s.passed).toBe(true);
    const { data: reports } = await db().from("reports").select("id, link_status, reporter_email").eq("ticket_id", s.ticketId);
    expect(reports).toHaveLength(3);
    expect(reports!.map((r) => r.link_status).sort()).toEqual(["auto_linked", "auto_linked", "new_ticket"]);
    const { data: t } = await db().from("tickets").select("category, assigned_team_id, maintenance_teams(team_name), assets(asset_code)").eq("id", s.ticketId).single();
    expect((t!.maintenance_teams as unknown as { team_name: string }).team_name).toBe("Appliance Maintenance");
    expect((t!.assets as unknown as { asset_code: string }).asset_code).toBe("WASHER-003");
    // Each student got their own confirmation.
    const { data: notes } = await db().from("notifications").select("recipient").eq("ticket_id", s.ticketId).eq("notification_type", "report_received");
    expect(new Set(notes!.map((n) => n.recipient)).size).toBe(3);
  });

  it("is concurrency-safe: simultaneous identical reports produce one ticket", async () => {
    const results = await Promise.all(
      [1, 2, 3, 4].map((i) =>
        submitReport({ qrSlug: "kossuth-b-floor2-washer02", description: "The washing machine door is broken.", reporterName: `C${i}`, reporterEmail: `c${i}@students.fiximperfect.example` }),
      ),
    );
    expect(new Set(results.map((r) => r.ticketId)).size).toBe(1);
    const { count } = await db().from("reports").select("id", { count: "exact", head: true }).eq("ticket_id", results[0].ticketId);
    expect(count).toBe(4);
  });

  it("sends uncertain matches to caretaker review instead of merging", async () => {
    const s = await scenarios.scenarioDuplicateDetection();
    const r = await submitReport({ qrSlug: "kossuth-b-floor2-washer03", description: "Washer number 3 makes a loud grinding noise", reporterName: "U", reporterEmail: "u@students.fiximperfect.example" });
    expect(r.ticketId).not.toBe(s.ticketId);
    expect(r.linkStatus).toBe("pending_review");
    expect(r.ticketStatus).toBe("needs_review");
    const { data: rep } = await db().from("reports").select("suggested_ticket_id, duplicate_confidence").eq("id", r.reportId).single();
    expect(rep!.suggested_ticket_id).toBe(s.ticketId);
    expect(Number(rep!.duplicate_confidence)).toBeGreaterThanOrEqual(0.65);
    expect(Number(rep!.duplicate_confidence)).toBeLessThan(0.85);
  });
});

describe("safety escalation", () => {
  it("escalates water near a socket: critical, queue bypassed, caretaker alerted", async () => {
    const s = await scenarios.scenarioSafetyEscalation();
    expect(s.passed).toBe(true);
    expect(s.escalationStatus).toBe("alerting");
    expect(s.alerts.map((a) => a.channel).sort()).toEqual(["email", "sms", "voice"]);
    expect(s.alerts.every((a) => a.delivery_status === "simulated")).toBe(true); // never claimed as sent
    const { data: ev } = await db().from("ticket_events").select("event_type").eq("ticket_id", s.ticketId);
    expect(ev!.map((e) => e.event_type)).toContain("emergency_alert_sent");
  });

  it("does not escalate an ordinary issue", async () => {
    const r = await submitReport({ qrSlug: "kossuth-b-floor2-washer04", description: "The washing machine door is broken.", reporterName: "N", reporterEmail: "n@students.fiximperfect.example" });
    expect(r.safetyLevel).toBe("none");
    expect(r.priority).not.toBe("critical");
    const { count } = await db().from("emergency_alerts").select("id", { count: "exact", head: true }).eq("ticket_id", r.ticketId);
    expect(count).toBe(0);
  });

  it("escalates to the backup contact after the acknowledgement deadline, and stops once acknowledged", async () => {
    const s = await scenarios.scenarioSafetyEscalation();
    expect((await runEscalationCheck()).find((x) => x.ticketId === s.ticketId)?.action).toBe("waiting");
    const summary = await scenarios.scenarioEscalationTimeout(s.ticketId);
    expect(summary.find((x) => x.ticketId === s.ticketId)?.action).toBe("escalated_to_secondary_caretaker");
    const { data: alerts } = await db().from("emergency_alerts").select("escalation_attempt").eq("ticket_id", s.ticketId);
    expect(Math.max(...alerts!.map((a) => a.escalation_attempt))).toBe(2);
    await acknowledgeTicket(s.ticketId, await staffProfile(CARETAKER));
    await scenarios.scenarioEscalationTimeout(s.ticketId);
    const { data: t } = await db().from("tickets").select("escalation_status").eq("id", s.ticketId).single();
    expect(t!.escalation_status).toBe("acknowledged");
    const { data: after } = await db().from("emergency_alerts").select("escalation_attempt").eq("ticket_id", s.ticketId);
    expect(Math.max(...after!.map((a) => a.escalation_attempt))).toBe(2);
  });
});

describe("staff permissions & audit", () => {
  it("RLS limits caretakers to their buildings and management to read-only", async () => {
    const s = await scenarios.scenarioDuplicateDetection(); // Kossuth Dorm B
    const riverside = await staffClient(RIVERSIDE);
    expect((await riverside.from("tickets").select("id").eq("id", s.ticketId)).data).toHaveLength(0);
    const upd = await riverside.from("tickets").update({ priority: "low" }).eq("id", s.ticketId).select("id");
    expect(upd.data ?? []).toHaveLength(0);

    const manager = await staffClient(MANAGER);
    expect((await manager.from("tickets").select("id").eq("id", s.ticketId)).data).toHaveLength(1);
    expect((await manager.from("tickets").update({ priority: "low" }).eq("id", s.ticketId).select("id")).data ?? []).toHaveLength(0);

    const caretaker = await staffClient(CARETAKER);
    expect((await caretaker.from("tickets").update({ priority: "high" }).eq("id", s.ticketId).select("id")).data).toHaveLength(1);
  });

  it("the ticket service refuses unauthorised modifications", async () => {
    const s = await scenarios.scenarioDuplicateDetection();
    await expect(changeStatus(await staffProfile(RIVERSIDE), s.ticketId, "in_progress")).rejects.toThrow(HttpError);
    await expect(changeStatus(await staffProfile(MANAGER), s.ticketId, "in_progress")).rejects.toThrow(/not allowed/);
    // Appliance technician is on the assigned team: may progress but not close.
    await changeStatus(await staffProfile(TECH), s.ticketId, "in_progress");
    await changeStatus(await staffProfile(TECH), s.ticketId, "resolved");
    await expect(changeStatus(await staffProfile(TECH), s.ticketId, "closed", "done")).rejects.toThrow(/caretakers/);
  });

  it("records every status change as an event and in the audit log", async () => {
    const s = await scenarios.scenarioDuplicateDetection();
    const ct = await staffProfile(CARETAKER);
    await changeStatus(ct, s.ticketId, "in_progress", "On site");
    await changeStatus(ct, s.ticketId, "waiting_for_parts", "Latch ordered");
    const { data: ev } = await db().from("ticket_events").select("old_value, new_value, actor_id, note").eq("ticket_id", s.ticketId).eq("event_type", "status_changed").order("created_at");
    expect(ev!.slice(-2)).toEqual([
      { old_value: "assigned", new_value: "in_progress", actor_id: ct.id, note: "On site" },
      { old_value: "in_progress", new_value: "waiting_for_parts", actor_id: ct.id, note: "Latch ordered" },
    ]);
    const { count } = await db().from("audit_logs").select("id", { count: "exact", head: true }).eq("entity_id", s.ticketId).eq("action", "ticket.status");
    expect(count).toBe(2);
    await expect(changeStatus(ct, s.ticketId, "closed", "x")).rejects.toThrow(/Cannot move/);
  });
});

describe("student-verified resolution", () => {
  it("sends one feedback request per reporting student, never duplicated", async () => {
    const s = await scenarios.scenarioDuplicateDetection();
    const ct = await staffProfile(CARETAKER);
    const { eventId } = await changeStatus(ct, s.ticketId, "resolved", "Fixed");
    await requestResolutionFeedback(s.ticketId, eventId as string); // second call must be a no-op
    const { data: fb } = await db().from("resolution_feedback").select("reporter_email").eq("ticket_id", s.ticketId);
    expect(fb).toHaveLength(3);
    const { data: notes } = await db().from("notifications").select("recipient").eq("ticket_id", s.ticketId).eq("notification_type", "resolution_confirmation_request");
    expect(notes).toHaveLength(3);
  });

  it("two confirmations + one negative response reopens the ticket and keeps history", async () => {
    const s = await scenarios.scenarioResolutionVerification();
    expect(s.passed).toBe(true);
    const { data: ev } = await db().from("ticket_events").select("event_type, new_value").eq("ticket_id", s.ticketId!).order("created_at");
    const types = ev!.map((e) => `${e.event_type}:${e.new_value ?? ""}`);
    expect(types).toContain("status_changed:resolved"); // previous resolution preserved
    expect(types).toContain("status_changed:reopened");
    expect(types.filter((t) => t.startsWith("feedback_positive"))).toHaveLength(2);
    expect(types).toContain("feedback_negative:still_broken");
    const { data: caretakerNote } = await db().from("notifications").select("recipient").eq("ticket_id", s.ticketId!).eq("notification_type", "ticket_reopened_negative_feedback");
    expect(caretakerNote!.map((n) => n.recipient)).toContain(CARETAKER);
  });

  it("does not count unanswered feedback as verified; all confirmations verify", async () => {
    const s = await scenarios.scenarioDuplicateDetection();
    await changeStatus(await staffProfile(CARETAKER), s.ticketId, "resolved", "Fixed");
    const tokens = await scenarios.feedbackTokensFromOutbox(s.ticketId);
    const [a, b, c] = scenarios.SCENARIO_1_REPORTS.map((r) => tokens.get(r.email)!);
    await submitFeedback(a, "fixed");
    await submitFeedback(b, "fixed");
    let t = (await db().from("tickets").select("resolution_verified").eq("id", s.ticketId).single()).data!;
    expect(t.resolution_verified).toBe(false);
    const before = await loadOverview(db());
    expect(before.unverified_resolutions).toBeGreaterThanOrEqual(1);
    await expect(submitFeedback(a, "still_broken")).rejects.toThrow(/already answered/);
    await submitFeedback(c, "fixed");
    t = (await db().from("tickets").select("resolution_verified").eq("id", s.ticketId).single()).data!;
    expect(t.resolution_verified).toBe(true);
    const after = await loadOverview(db());
    expect(after.student_verified).toBe(before.student_verified + 1);
  });
});

describe("costs, asset intelligence and analytics", () => {
  it("computes repair totals on the server, exactly", async () => {
    const s = await scenarios.scenarioDuplicateDetection();
    const row = await addCost(await staffProfile(CARETAKER), s.ticketId, { partsCost: "10.10", labourCost: "20.20", otherCost: "0.03", currency: "EUR", expenseDate: "2026-11-01" });
    expect(String(row.total_cost)).toBe("30.33");
    // A client cannot write the total: the column is generated.
    const direct = await db().from("maintenance_costs").insert({ ticket_id: s.ticketId, parts_cost: "1.00", total_cost: "999.00" });
    expect(direct.error).not.toBeNull();
  });

  it("flags Washer #1 for replacement review at 110.5%", async () => {
    const s = await scenarios.scenarioPredictiveMaintenance();
    expect(s.passed).toBe(true);
    expect(s.failures60d).toBe(4);
    expect(s.cumulativeRepairCost).toBe(420);
    expect(s.replacementCost).toBe(380);
    expect(s.ratio).toBe(110.5);
    const others = (await loadAssetStats(db())).filter((a) => a.replacement_review && a.asset_code !== "WASHER-001");
    expect(others).toHaveLength(0);
  });

  it("distinguishes individual reports from unique tickets", async () => {
    const before = await loadOverview(db());
    await scenarios.scenarioDuplicateDetection();
    const after = await loadOverview(db());
    expect(after.total_reports - before.total_reports).toBe(3);
    expect(after.unique_tickets - before.unique_tickets).toBe(1);
    expect(after.duplicate_reports - before.duplicate_reports).toBe(2);
  });

  it("scopes analytics by RLS for a caretaker session", async () => {
    const all = await loadOverview(db());
    const riverside = await loadOverview(await staffClient(RIVERSIDE));
    expect(riverside.unique_tickets).toBeLessThan(all.unique_tickets);
    expect(riverside.unique_tickets).toBeGreaterThan(0);
  });
});

describe("demo reset", () => {
  it("can be reset and re-run repeatedly with identical results", async () => {
    const first = await scenarios.scenarioDuplicateDetection();
    await seedDemo();
    const second = await scenarios.scenarioDuplicateDetection();
    expect(first.passed && second.passed).toBe(true);
    expect(first.reports.map((r) => r.link)).toEqual(second.reports.map((r) => r.link));
    const { count } = await db().from("tickets").select("id", { count: "exact", head: true });
    expect(count).toBe(17); // 16 seeded history tickets + 1 scenario ticket
  });
});
