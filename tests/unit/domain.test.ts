import { describe, expect, it } from "vitest";
import { canTransition, TRANSITIONS } from "@/lib/tickets/state-machine";
import { TICKET_STATUSES } from "@/types/domain";
import { sumMoney, CostSchema } from "@/lib/validations/schemas";
import { generateToken, hashToken, isWellFormedToken } from "@/lib/security/tokens";
import { sniffImageType, validateImage, ImageValidationError, MAX_IMAGE_BYTES } from "@/lib/storage/images";
import { canCoordinateTicket, canManageTicket } from "@/lib/auth/permissions";
import { resolveRouting, type RoutingDirectory } from "@/lib/routing/router";
import { deterministicRecommendation, recommendationLevel, type AssetStats } from "@/lib/assets/intelligence";
import type { StaffProfile } from "@/types/domain";

describe("ticket state machine", () => {
  it("covers every status", () => expect(Object.keys(TRANSITIONS).sort()).toEqual([...TICKET_STATUSES].sort()));
  it("allows the standard repair path", () => {
    expect(canTransition("assigned", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "waiting_for_parts")).toBe(true);
    expect(canTransition("waiting_for_parts", "resolved")).toBe(true);
    expect(canTransition("resolved", "reopened")).toBe(true);
    expect(canTransition("resolved", "closed")).toBe(true);
  });
  it("rejects skipping or reversing history", () => {
    expect(canTransition("closed", "assigned")).toBe(false);
    expect(canTransition("submitted", "resolved")).toBe(false);
    expect(canTransition("resolved", "in_progress")).toBe(false);
  });
});

describe("money", () => {
  it("sums exactly without floating point error", () => {
    expect(sumMoney("0.10", "0.20")).toBe("0.30");
    expect(sumMoney("95.00", "110.00", "105.00", "110.00")).toBe("420.00");
    expect(sumMoney("10.1", "20.2", "0.03")).toBe("30.33");
  });
  it("rejects negative or over-precise amounts", () => {
    expect(CostSchema.safeParse({ partsCost: "-1", expenseDate: "2026-01-01" }).success).toBe(false);
    expect(CostSchema.safeParse({ partsCost: "1.005", expenseDate: "2026-01-01" }).success).toBe(false);
    expect(CostSchema.safeParse({ partsCost: "12.50", labourCost: "40", expenseDate: "2026-01-01" }).success).toBe(true);
  });
});

describe("secure tokens", () => {
  it("are random, URL-safe and long", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(isWellFormedToken(a)).toBe(true);
    expect(a.length).toBeGreaterThanOrEqual(43);
  });
  it("are stored as SHA-256 hashes", () => {
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("abc")).toBe(hashToken("abc"));
  });
  it("rejects malformed tokens before lookup", () => {
    expect(isWellFormedToken("../../etc")).toBe(false);
    expect(isWellFormedToken("short")).toBe(false);
  });
});

describe("image validation", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  it("detects real formats by magic bytes", () => {
    expect(sniffImageType(png)).toBe("image/png");
    expect(sniffImageType(jpg)).toBe("image/jpeg");
  });
  it("rejects disguised files and oversized uploads", () => {
    expect(() => validateImage(new TextEncoder().encode("<script>alert(1)</script>"))).toThrow(ImageValidationError);
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(png);
    expect(() => validateImage(big)).toThrow(/5 MB/);
  });
});

const staff = (p: Partial<StaffProfile>): StaffProfile => ({ id: "u1", full_name: "X", email: "x@x", phone: null, role: "caretaker", building_access: ["b1"], is_active: true, ...p });
const ticket = { building_id: "b1", assigned_to: null, assigned_team_id: "team-a" };

describe("staff permissions", () => {
  it("caretakers manage only their buildings", () => {
    expect(canManageTicket(staff({}), ticket)).toBe(true);
    expect(canManageTicket(staff({ building_access: ["b2"] }), ticket)).toBe(false);
  });
  it("maintenance staff only manage tickets assigned to them or their team", () => {
    expect(canManageTicket(staff({ role: "maintenance_staff" }), ticket, ["team-a"])).toBe(true);
    expect(canManageTicket(staff({ role: "maintenance_staff" }), ticket, ["team-b"])).toBe(false);
    expect(canCoordinateTicket(staff({ role: "maintenance_staff" }), ticket)).toBe(false);
  });
  it("management is read-only; administrators can do everything", () => {
    expect(canManageTicket(staff({ role: "management" }), ticket)).toBe(false);
    expect(canManageTicket(staff({ role: "administrator", building_access: [] }), ticket)).toBe(true);
  });
});

describe("team routing validation", () => {
  const dir: RoutingDirectory = {
    teams: [
      { id: "t1", team_name: "Appliance Maintenance", responsible_categories: ["Laundry Equipment"], open_tickets: 0, is_manual_review_queue: false },
      { id: "t2", team_name: "Plumbing", responsible_categories: ["Plumbing"], open_tickets: 3, is_manual_review_queue: false },
      { id: "t9", team_name: "Manual Review Queue", responsible_categories: [], open_tickets: 0, is_manual_review_queue: true },
    ],
    ruleTeamName: "Appliance Maintenance",
    manualQueue: { id: "t9", team_name: "Manual Review Queue", responsible_categories: [], open_tickets: 0, is_manual_review_queue: true },
    categoryDefaultPriority: "medium",
  };
  it("accepts a valid, responsible AI recommendation", () => {
    expect(resolveRouting(dir, "Laundry Equipment", "Appliance Maintenance", "ok").source).toBe("ai_validated");
  });
  it("ignores invented teams and falls back to the DB rule", () => {
    const r = resolveRouting(dir, "Laundry Equipment", "Laundry Ninjas", "made up");
    expect(r.teamName).toBe("Appliance Maintenance");
    expect(r.source).toBe("rule");
  });
  it("ignores a real team that is not responsible for the category", () => {
    expect(resolveRouting(dir, "Laundry Equipment", "Plumbing", "x").teamName).toBe("Appliance Maintenance");
  });
  it("sends unroutable categories to manual review", () => {
    const r = resolveRouting({ ...dir, ruleTeamName: null }, "Roof", null, null);
    expect(r.needsReview).toBe(true);
    expect(r.teamName).toBe("Manual Review Queue");
  });
});

describe("asset replacement recommendation", () => {
  const base: AssetStats = {
    asset_id: "a", asset_code: "WASHER-003", asset_name: "Washer #3", category: "Laundry Equipment", building_id: "b", building_name: "Kossuth Dorm B",
    location_name: "Laundry Room", floor: 2, installation_date: "2023-03-01", age_years: 3.7, expected_useful_life_years: 8, currency: "EUR",
    replacement_cost: 380, failures_30d: 2, failures_60d: 4, failures_90d: 4, failures_total: 4, repair_count: 4, cumulative_repair_cost: 420,
    average_repair_cost: 105, other_currency_costs: {}, mean_days_between_failures: 15.7, repeat_failures_after_repair: 3,
    repair_to_replacement_ratio: 110.5, failure_threshold: 4, window_days: 60, ratio_threshold: 100, flag_frequent_failures: true,
    flag_cost_exceeds_replacement: true, flag_beyond_useful_life: false, replacement_review: true,
  };
  it("produces the evidence-based recommendation text from computed figures only", () => {
    expect(deterministicRecommendation(base)).toBe(
      "Washer #3 in Kossuth Dorm B has failed four times within 60 days. Recorded repair expenditure is €420, exceeding the estimated replacement cost of €380. A replacement assessment is recommended.",
    );
    expect(recommendationLevel(base)).toBe("replacement_review");
  });
  it("does not recommend replacement when only one condition is met", () => {
    const s = { ...base, cumulative_repair_cost: 200, repair_to_replacement_ratio: 52.6, flag_cost_exceeds_replacement: false, replacement_review: false };
    expect(recommendationLevel(s)).toBe("watch");
    expect(deterministicRecommendation(s)).not.toContain("replacement assessment is recommended");
  });
});

