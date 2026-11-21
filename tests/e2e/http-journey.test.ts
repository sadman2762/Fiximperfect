import { beforeAll, describe, expect, it } from "vitest";
import { assertStackUp, db, tinyPng } from "../support/helpers";
import { seedDemo, DEMO_PASSWORD } from "@/lib/demo/seed";
import { feedbackTokensFromOutbox } from "@/lib/demo/scenarios";

/**
 * End-to-end tests over HTTP against a running Fiximperfect server
 * (default http://localhost:3000; override with E2E_BASE_URL).
 * Start it first: `npm run build && npm start`.
 */
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

async function staffCookie(email: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, "content-type": "application/json" },
    body: JSON.stringify({ email, password: DEMO_PASSWORD }),
  });
  const session = await res.text();
  const ref = new URL(url).hostname.split(".")[0];
  return `sb-${ref}-auth-token=base64-${Buffer.from(session).toString("base64url")}`;
}

async function report(fields: Record<string, string>, photo?: Uint8Array) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  if (photo) fd.set("photo", new Blob([Buffer.from(photo)], { type: "image/png" }), "photo.png");
  const res = await fetch(`${BASE}/api/reports`, { method: "POST", body: fd });
  return { status: res.status, body: await res.json() };
}

const post = (path: string, body: unknown, cookie?: string) =>
  fetch(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });

beforeAll(async () => {
  await assertStackUp();
  const up = await fetch(BASE).catch(() => null);
  if (!up?.ok) throw new Error(`Fiximperfect server not reachable at ${BASE}. Run "npm run build && npm start" first.`);
  await seedDemo();
});

describe("student → caretaker → student journey over HTTP", () => {
  let ticketId = "";
  let trackingUrl = "";

  it("three students report Washer #3 through the public API (one with a photo)", async () => {
    const students = [
      ["A", "The washing machine door is broken."],
      ["B", "Washer number 3 will not close."],
      ["C", "The laundry machine door latch seems damaged."],
    ];
    const results = [];
    for (const [i, [letter, text]] of students.entries()) {
      const r = await report(
        { qrSlug: "kossuth-b-floor2-washer03", description: text, reporterName: `Student ${letter}`, reporterEmail: `e2e.${letter.toLowerCase()}@students.fiximperfect.example` },
        i === 0 ? tinyPng() : undefined,
      );
      expect(r.status).toBe(201);
      results.push(r.body);
    }
    expect(new Set(results.map((r) => r.ticketNumber)).size).toBe(1);
    expect(results.map((r) => r.linkStatus)).toEqual(["new_ticket", "auto_linked", "auto_linked"]);
    expect(results[2].linkedReports).toBe(3);
    expect(results[0]).not.toHaveProperty("reportId"); // no internal IDs leak to students
    trackingUrl = results[1].trackingUrl;
    const { data } = await db().from("tickets").select("id").eq("ticket_number", results[0].ticketNumber).single();
    ticketId = data!.id;
  });

  it("the tracking link shows only that student's report", async () => {
    const html = await (await fetch(trackingUrl)).text();
    expect(html).toContain("Washer number 3 will not close.");
    expect(html).not.toContain("e2e.a@students"); // other students' contact details never shown
    expect(html).not.toContain("The washing machine door is broken.");
    const bad = await (await fetch(`${BASE}/track/${"x".repeat(43)}`)).text();
    expect(bad).toContain("Link not valid");
  });

  it("staff pages and APIs require a session; maintenance staff cannot close tickets", async () => {
    expect((await fetch(`${BASE}/tickets/${ticketId}`, { redirect: "manual" })).status).toBe(307);
    expect((await post(`/api/tickets/${ticketId}/status`, { status: "in_progress" })).status).toBe(401);
    const manager = await staffCookie("manager@fiximperfect.example");
    expect((await post(`/api/tickets/${ticketId}/status`, { status: "in_progress" }, manager)).status).toBe(403);
    const tech = await staffCookie("appliance.tech@fiximperfect.example");
    expect((await post(`/api/tickets/${ticketId}/status`, { status: "in_progress" }, tech)).status).toBe(200);
    const page = await fetch(`${BASE}/tickets/${ticketId}`, { headers: { cookie: tech } });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Linked reports (3 reports from 3 students)");
  });

  it("caretaker records a cost and resolves; each reporter gets their own feedback link", async () => {
    const ct = await staffCookie("caretaker@fiximperfect.example");
    const cost = await post(`/api/tickets/${ticketId}/cost`, { partsCost: "18.40", labourCost: "35", otherCost: "0", currency: "EUR", expenseDate: "2026-11-20", total: "1.00" }, ct);
    expect(cost.status).toBe(200);
    expect((await cost.json()).total_cost).toBe(53.4);
    const bad = await post(`/api/tickets/${ticketId}/status`, { status: "closed" }, ct);
    expect(bad.status).toBe(422); // in_progress -> closed is not a valid transition
    expect((await post(`/api/tickets/${ticketId}/status`, { status: "resolved", note: "Latch replaced" }, ct)).status).toBe(200);
    const tokens = await feedbackTokensFromOutbox(ticketId);
    expect(tokens.size).toBe(3);
  });

  it("two students confirm, one says still broken → ticket reopens", async () => {
    const tokens = await feedbackTokensFromOutbox(ticketId);
    const page = await (await fetch(`${BASE}/feedback/${tokens.get("e2e.a@students.fiximperfect.example")}?answer=fixed`)).text();
    expect(page).toContain("Is the problem actually fixed?"); // GET never records an answer
    expect((await post("/api/feedback", { token: tokens.get("e2e.a@students.fiximperfect.example"), response: "fixed" })).status).toBe(200);
    expect((await post("/api/feedback", { token: tokens.get("e2e.b@students.fiximperfect.example"), response: "fixed" })).status).toBe(200);
    expect((await post("/api/feedback", { token: tokens.get("e2e.a@students.fiximperfect.example"), response: "still_broken" })).status).toBe(409);
    const neg = await post("/api/feedback", { token: tokens.get("e2e.c@students.fiximperfect.example"), response: "still_broken", comment: "Door pops open" });
    expect(await neg.json()).toMatchObject({ ok: true, reopened: true, verified: false });
    const { data } = await db().from("tickets").select("status, reopened_count").eq("id", ticketId).single();
    expect(data).toEqual({ status: "reopened", reopened_count: 1 });
  });
});

describe("emergency flow over HTTP", () => {
  it("critical report alerts staff; acknowledgement link stops escalation", async () => {
    const r = await report({ qrSlug: "kossuth-b-floor1-corridor", description: "There is water near an electrical socket.", reporterName: "D", reporterEmail: "e2e.d@students.fiximperfect.example" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ priority: "critical", safetyLevel: "critical" });
    const { data: t } = await db().from("tickets").select("id").eq("ticket_number", r.body.ticketNumber).single();
    const { data: n } = await db().from("notifications").select("body_preview").eq("ticket_id", t!.id).eq("notification_type", "emergency_alert").eq("channel", "sms").single();
    const token = /\/emergency\/ack\/([A-Za-z0-9_-]+)/.exec(n!.body_preview!)![1];
    expect((await post("/api/emergency/ack", { token })).status).toBe(200);
    const { data: after } = await db().from("tickets").select("escalation_status").eq("id", t!.id).single();
    expect(after!.escalation_status).toBe("acknowledged");
  });

  it("the cron endpoint rejects requests without the secret", async () => {
    expect((await fetch(`${BASE}/api/cron/escalations`)).status).toBe(401);
    const ok = await fetch(`${BASE}/api/cron/escalations`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    expect(ok.status).toBe(200);
  });
});

describe("public endpoint protections", () => {
  it("validates input and rate-limits repeated submissions from one email", async () => {
    const invalid = await report({ qrSlug: "kossuth-b-floor2-washer03", description: "x", reporterName: "", reporterEmail: "nope" });
    expect(invalid.status).toBe(400);
    const unknown = await report({ qrSlug: "no-such-code", description: "Broken thing", reporterName: "Z", reporterEmail: "z@students.fiximperfect.example" });
    expect(unknown.status).toBe(404);
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      statuses.push((await report({ qrSlug: "kossuth-a-floor2-corridor", description: `Notice board broken ${i}`, reporterName: "Spam", reporterEmail: "spam@students.fiximperfect.example" })).status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 201)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});
