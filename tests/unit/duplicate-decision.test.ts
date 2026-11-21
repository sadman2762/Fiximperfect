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
  it.each(["Washer number 3 will not close.", "The laundry machine door latch seems damaged."])("links '%s' with high confidence", (description) => {
    const r = mockDuplicate({ description, category: "Laundry Equipment", asset_code: "WASHER-003", issue: "Damaged door latch" }, [candidate]);
    expect(r.matched_ticket).toBe("MNT-017");
    expect(r.confidence).toBeGreaterThanOrEqual(0.85);
  });
  it("does not auto-link a different asset", () => {
    const r = mockDuplicate({ description: "The fridge is warm", category: "Kitchen Appliances", asset_code: "FRIDGE-001", issue: "Not cooling properly" }, [candidate]);
    expect(decideLink(r, t).decision).toBe("new");
  });
});
