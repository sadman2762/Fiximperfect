import { describe, expect, it } from "vitest";
import { decideLink } from "@/lib/duplicate-detection/decision";
import { mockDuplicate } from "@/lib/agents/mock/fixtures";
import { DuplicateChecked } from "@/lib/agents/schemas";
import type { DuplicateCandidate } from "@/lib/agents/schemas";

const t = { autoLink: 0.85, review: 0.65 };

describe("duplicate threshold policy", () => {
  it("auto-links at or above 85%", () => {
    expect(decideLink({ is_duplicate: true, matched_ticket: "MNT-001", confidence: 0.96, reason: "same" }, t).decision).toBe("link");
    expect(decideLink({ is_duplicate: true, matched_ticket: "MNT-001", confidence: 0.85, reason: "same" }, t).decision).toBe("link");
  });
  it("flags 65–84% for caretaker review instead of merging", () => {
    const d = decideLink({ is_duplicate: true, matched_ticket: "MNT-001", confidence: 0.72, reason: "maybe" }, t);
    expect(d.decision).toBe("review");
    expect(d.reason).toContain("72%");
  });
  it("creates a new ticket below 65%", () => {
    expect(decideLink({ is_duplicate: false, matched_ticket: "MNT-001", confidence: 0.4, reason: "different" }, t).decision).toBe("new");
  });
  it("never auto-links when the agent says it is not a duplicate", () => {
    expect(decideLink({ is_duplicate: false, matched_ticket: "MNT-001", confidence: 0.9, reason: "x" }, t).decision).toBe("review");
  });
  it("creates a new ticket when there is no match", () => {
    expect(decideLink({ is_duplicate: false, matched_ticket: null, confidence: 0.99, reason: "x" }, t).decision).toBe("new");
  });
  it("rejects out-of-range AI confidence", () => {
    expect(DuplicateChecked.safeParse({ is_duplicate: true, matched_ticket: "X", confidence: 1.4, reason: "r" }).success).toBe(false);
  });
});

describe("mock duplicate fixture (demo scenario 1 wording)", () => {
  const candidate: DuplicateCandidate = {
    id: "1",
    location_id: "laundry",
    ticket_number: "MNT-017",
    category: "Laundry Equipment",
    title: "Washer #3: Damaged door latch",
    description: "Damaged door latch reported at Washer #3",
    status: "assigned",
    asset_code: "WASHER-003",
    asset_name: "Washer #3",
    area_name: "Laundry Room",
    floor: 2,
    created_at: new Date().toISOString(),
    report_descriptions: ["The washing machine door is broken."],
  };
  const report = (description: string, category: string, asset_code: string | null, issue: string, location_id = "laundry") => ({ description, category, asset_code, issue, location_id });
  it.each(["Washer number 3 will not close.", "The laundry machine door latch seems damaged."])("links '%s' with high confidence", (description) => {
    const r = mockDuplicate(report(description, "Laundry Equipment", "WASHER-003", "Damaged door latch"), [candidate]);
    expect(r.matched_ticket).toBe("MNT-017");
    expect(r.confidence).toBeGreaterThanOrEqual(0.85);
  });
  it("links a report that names no machine when room, category and fault match", () => {
    const r = mockDuplicate(report("The washing machine door is broken.", "Laundry Equipment", null, "Damaged door latch"), [candidate]);
    expect(decideLink(r, t).decision).toBe("link");
  });
  it("does not merge a fridge problem with a washer problem in the same room", () => {
    const r = mockDuplicate(report("The fridge is warm", "Kitchen Appliances", "FRIDGE-001", "Not cooling properly"), [candidate]);
    expect(decideLink(r, t).decision).toBe("new");
  });
  it("does not merge the same fault on a different machine", () => {
    const r = mockDuplicate(report("Washer number 4 door latch is damaged", "Laundry Equipment", "WASHER-004", "Damaged door latch"), [candidate]);
    expect(decideLink(r, t).decision).toBe("new");
  });
  it("does not merge the same fault in a different room", () => {
    const r = mockDuplicate(report("The washing machine door latch is damaged.", "Laundry Equipment", null, "Damaged door latch", "other-room"), [candidate]);
    expect(decideLink(r, t).decision).not.toBe("link");
  });
});

