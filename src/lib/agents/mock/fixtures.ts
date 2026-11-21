/**
 * MOCK AI FIXTURES — used only when AI_MODE=mock (or when explicitly requested
 * by tests). They are deterministic keyword heuristics that produce outputs in
 * exactly the same validated shape as the live Claude agents, so the rest of
 * the workflow (database writes, routing, escalation, notifications) runs
 * unchanged. Every result produced here is stored and displayed with
 * mode = "mock"; it is never presented as a live AI decision.
 */
import type {
  Classification,
  DuplicateAssessment,
  DuplicateCandidate,
  ReportContext,
  SafetyAssessment,
  TeamOption,
  TriageRecommendation,
} from "@/lib/agents/schemas";
import { evaluateSafetyRules, HAZARD_LABEL } from "@/lib/safety/rules";
import type { Priority } from "@/types/domain";

const CATEGORY_KEYWORDS: [string, RegExp][] = [
  ["Electrical", /\b(socket|outlet|spark|wiring|wire|fuse|breaker|light(?:s)? (?:not|won'?t)|power cut|no power|electric)/i],
  ["Laundry Equipment", /\b(wash(?:er|ing machine)?|laundry|dryer|tumble|spin cycle|detergent)/i],
  ["Kitchen Appliances", /\b(fridge|refrigerator|freezer|oven|stove|hob|microwave|kettle|dishwasher|cooker)/i],
  ["Plumbing", /\b(leak|tap|faucet|sink|toilet|shower|drain|pipe|clog|blocked|flood|water pressure|hot water)/i],
  ["Heating", /\b(heat(?:ing|er)?|radiator|boiler|cold room|thermostat|ventilation|air ?con)/i],
  ["Internet", /\b(wi-?fi|internet|network|router|ethernet|connection|eduroam)/i],
  ["Furniture", /\b(chair|desk|table|bed|wardrobe|drawer|shelf|sofa|mattress|cupboard)/i],
];

const ISSUE_KEYWORDS: [RegExp, string][] = [
  [/\b(door|latch|close|shut|lock)\b/i, "Damaged door latch"],
  [/\b(not (?:spin|drain)|won'?t (?:spin|drain)|spin)/i, "Drum not spinning or draining"],
  [/\b(leak|drip)/i, "Water leak"],
  [/\b(not cold|warm|temperature)/i, "Not cooling properly"],
  [/\b(no heat|cold|radiator)/i, "No heating"],
  [/\b(slow|drop|disconnect|no (?:wi-?fi|internet|connection))/i, "Connectivity failure"],
  [/\b(broken|crack|wobbl|loose)/i, "Broken or damaged item"],
  [/\b(socket|spark|wiring)/i, "Electrical fault"],
];

export function mockClassify(ctx: ReportContext): Classification {
  const text = `${ctx.description} ${ctx.additionalDetails ?? ""}`;
  let category = ctx.asset?.category ?? null;
  let confidence = ctx.asset ? 0.92 : 0.4;
  if (!category) {
    const hit = CATEGORY_KEYWORDS.find(([, re]) => re.test(text));
    if (hit) {
      category = hit[0];
      confidence = 0.78;
    }
  }
  // Electrical hazards override appliance categories only for location-level reports.
  if (!ctx.asset && /\b(socket|outlet|spark|wiring)\b/i.test(text)) category = "Electrical";
  if (!category || !ctx.categories.includes(category)) {
    category = ctx.categories.includes("General") ? "General" : ctx.categories[0];
    confidence = Math.min(confidence, 0.45);
  }
  const issue = ISSUE_KEYWORDS.find(([re]) => re.test(text))?.[1] ?? "Reported fault";
  // Location QR: pick a registered asset whose name is mentioned (or the only one of the category).
  let assetCode = ctx.asset?.asset_code ?? null;
  if (!assetCode) {
    const NAME_HINTS: [RegExp, RegExp][] = [
      [/\b(fridge|refrigerator|freezer)/i, /refrigerator|fridge/i],
      [/\b(oven|stove|cooker)/i, /oven/i],
      [/\b(wash(?:er|ing machine)?)/i, /washer/i],
      [/\b(dryer|tumble)/i, /dryer/i],
      [/\b(wi-?fi|router|internet)/i, /wi-?fi|access point|router/i],
      [/\b(shower)/i, /shower/i],
      [/\b(radiator|heater)/i, /radiator/i],
    ];
    const sameCategory = ctx.locationAssets.filter((a) => a.category === category);
    const hint = NAME_HINTS.find(([t]) => t.test(text));
    const named = hint ? sameCategory.filter((a) => hint[1].test(a.asset_name)) : [];
    const pick = named.length === 1 ? named[0] : sameCategory.length === 1 ? sameCategory[0] : null;
    if (pick) assetCode = pick.asset_code;
  }
  const rules = evaluateSafetyRules(text);
  const subject = ctx.asset?.asset_name ?? ctx.areaName;
  return {
    category,
    subcategory: ctx.asset?.asset_name.replace(/\s*#?\d+$/, "") ?? category,
    asset_code: assetCode,
    issue,
    title: `${subject}: ${issue}`.slice(0, 120),
    summary: `[Mock fixture] ${issue} reported at ${subject}, ${ctx.buildingName} floor ${ctx.floor}.`,
    confidence,
    image_assessment: ctx.image ? "inconclusive" : "not_provided",
    visual_evidence: ctx.image ? ["[Mock fixture] Image received but not analysed in mock mode."] : [],
    inferred_causes: [],
    safety_flags: rules.hazards,
  };
}

export function mockSafety(ctx: ReportContext): SafetyAssessment {
  const rules = evaluateSafetyRules(`${ctx.description} ${ctx.additionalDetails ?? ""}`);
  return {
    safety_level: rules.level,
    detected_hazards: rules.hazards,
    reason:
      rules.hazards.length > 0
        ? `[Mock fixture] Keyword assessment: ${rules.hazards.map((h) => HAZARD_LABEL[h]).join(", ")}.`
        : "[Mock fixture] No hazard keywords found.",
    observed_evidence: [],
    requires_immediate_escalation: rules.level === "critical",
  };
}

// Words that identify the asset/location or come from fixture text — not evidence about the fault itself.
const STOP = new Set([
  "the", "a", "an", "is", "it", "of", "and", "to", "in", "on", "at", "my", "this", "that", "seems", "will", "not", "be", "number",
  "there", "has", "have", "washing", "mock", "fixture", "reported", "fault", "kossuth", "dorm", "floor", "room", "again",
]);
const SYNONYMS: Record<string, string> = {
  washer: "washing", laundry: "washing", machine: "washing", latch: "door", close: "door", shut: "door", closing: "door",
  lock: "door", broken: "damaged", damaged: "damaged", fridge: "refrigerator",
};
function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .map((w) => SYNONYMS[w] ?? w)
      .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w)),
  );
}

/**
 * Same asset + same category alone reaches only the review band (0.65);
 * matching fault wording is required to reach the auto-link band (>= 0.85).
 */
export function mockDuplicate(
  report: { description: string; category: string; asset_code: string | null; issue: string },
  candidates: DuplicateCandidate[],
): DuplicateAssessment {
  let best: { c: DuplicateCandidate; score: number; why: string[] } | null = null;
  const mine = tokens(`${report.description} ${report.issue}`);
  for (const c of candidates) {
    const why: string[] = [];
    let score = 15;
    if (report.asset_code && c.asset_code === report.asset_code) {
      score += 35;
      why.push("same asset");
    }
    if (c.category === report.category) {
      score += 15;
      why.push("same category");
    }
    const theirs = tokens(`${c.title} ${c.description} ${c.report_descriptions.join(" ")}`);
    const overlap = [...mine].filter((t) => theirs.has(t)).length;
    const sim = mine.size && theirs.size ? overlap / Math.min(mine.size, theirs.size) : 0;
    score += Math.round(Math.min(1, sim) * 30);
    if (overlap) why.push(`${overlap} matching fault keyword(s)`);
    else why.push("no matching fault description");
    if (!best || score > best.score) best = { c, score, why };
  }
  if (!best) return { is_duplicate: false, matched_ticket: null, confidence: 0.05, reason: "[Mock fixture] No active candidate tickets." };
  const confidence = Math.min(99, best.score) / 100;
  return {
    is_duplicate: confidence >= 0.85,
    matched_ticket: best.c.ticket_number,
    confidence,
    reason: `[Mock fixture] Best candidate ${best.c.ticket_number}: ${best.why.join(", ")}.`,
  };
}

const CATEGORY_PRIORITY: Record<string, Priority> = {
  Electrical: "high",
  Plumbing: "high",
  Heating: "high",
  "Laundry Equipment": "medium",
  "Kitchen Appliances": "medium",
  Internet: "medium",
  Furniture: "low",
  General: "low",
};

export function mockTriage(
  classification: Classification,
  safetyLevel: string,
  teams: TeamOption[],
  ruleTeam: string | null,
): TriageRecommendation {
  let priority: Priority = CATEGORY_PRIORITY[classification.category] ?? "medium";
  if (safetyLevel === "critical") priority = "critical";
  else if (safetyLevel === "elevated" && priority !== "high") priority = "high";
  const team =
    ruleTeam ??
    teams.find((t) => t.responsible_categories.includes(classification.category))?.team_name ??
    teams.find((t) => t.is_manual_review_queue)?.team_name ??
    "";
  return {
    priority,
    priority_reason: `[Mock fixture] Default priority for ${classification.category}${safetyLevel !== "none" ? ` with ${safetyLevel} safety level` : ""}.`,
    recommended_team: team,
    assignment_reason: `[Mock fixture] ${team} is responsible for ${classification.category}.`,
  };
}
