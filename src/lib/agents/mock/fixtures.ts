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
      confidence = 0.8;
    }
  }
  // Electrical hazards take precedence over appliance categories.
  if (!ctx.asset && /\b(socket|outlet|spark|wiring)\b/i.test(text)) category = "Electrical";
  // The student's own choice is a hint when the text does not say otherwise.
  if (ctx.studentCategory && ctx.categories.includes(ctx.studentCategory) && (!category || category === "General")) {
    category = ctx.studentCategory;
    confidence = Math.max(confidence, 0.75);
  } else if (ctx.studentCategory && ctx.studentCategory === category) {
    confidence = Math.max(confidence, 0.9);
  }
  if (!category || !ctx.categories.includes(category)) {
    category = ctx.categories.includes("General") ? "General" : ctx.categories[0];
    confidence = Math.min(confidence, 0.45);
  }
  const issue = ISSUE_KEYWORDS.find(([re]) => re.test(text))?.[1] ?? "Reported fault";

  // Equipment is identified from the text, never from the QR code: a numbered
  // machine ("washer number 3") or the only machine of that category in the room.
  let assetCode = ctx.asset?.asset_code ?? null;
  if (!assetCode) {
    const NAME_HINTS: [RegExp, RegExp][] = [
      [/\b(fridge|refrigerator|freezer)/i, /refrigerator|fridge/i],
      [/\b(oven|stove|cooker)/i, /oven/i],
      [/\b(wash(?:er|ing machine)?|laundry machine)/i, /washer/i],
      [/\b(dryer|tumble)/i, /dryer/i],
      [/\b(wi-?fi|router|internet)/i, /wi-?fi|access point|router/i],
      [/\b(shower)/i, /shower/i],
      [/\b(radiator|heater)/i, /radiator/i],
    ];
    const sameCategory = ctx.locationAssets.filter((a) => a.category === category);
    const hint = NAME_HINTS.find(([t]) => t.test(text));
    const named = hint ? sameCategory.filter((a) => hint[1].test(a.asset_name)) : [];
    const number = /\b(?:no\.?|number|#)\s*(\d+)\b|\b(?:washer|dryer|fridge|refrigerator|oven)\s*#?(\d+)\b/i.exec(text);
    const n = number ? Number(number[1] ?? number[2]) : null;
    const byNumber = n !== null ? named.filter((a) => new RegExp(`#?0*${n}\\b`).test(a.asset_name) || new RegExp(`-0*${n}$`).test(a.asset_code)) : [];
    const pick = byNumber.length === 1 ? byNumber[0] : named.length === 1 ? named[0] : sameCategory.length === 1 ? sameCategory[0] : null;
    if (pick) assetCode = pick.asset_code;
  }
  const rules = evaluateSafetyRules(text);
  const assetName = assetCode ? (ctx.locationAssets.find((a) => a.asset_code === assetCode)?.asset_name ?? ctx.asset?.asset_name ?? null) : null;
  const subject = assetName ?? ctx.areaName;
  return {
    category,
    subcategory: assetName?.replace(/\s*#?\d+$/, "") ?? category,
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
 * Location-based scoring: same room +30, same category +20, same identified
 * machine +15, matching fault wording up to +35. Same room + category alone is
 * 0.50 (new ticket); the same machine with a different fault is 0.65 (caretaker
 * review); matching wording lifts a report into auto-link (>= 0.85). Two different identified machines never match, and
 * different categories in the same room stay separate problems.
 */
export function mockDuplicate(
  report: { description: string; category: string; asset_code: string | null; issue: string; location_id?: string | null },
  candidates: DuplicateCandidate[],
): DuplicateAssessment {
  let best: { c: DuplicateCandidate; score: number; why: string[] } | null = null;
  const mine = tokens(`${report.description} ${report.issue}`);
  for (const c of candidates) {
    const why: string[] = [];
    let score = 0;
    if (report.location_id && c.location_id === report.location_id) {
      score += 30;
      why.push("same room or area");
    }
    if (c.category === report.category) {
      score += 20;
      why.push("same category");
    } else {
      why.push("different category");
    }
    if (report.asset_code && c.asset_code) {
      if (c.asset_code === report.asset_code) {
        score += 15;
        why.push("same equipment");
      } else {
        score -= 40;
        why.push("different equipment");
      }
    }
    const theirs = tokens(`${c.title} ${c.description} ${c.report_descriptions.join(" ")}`);
    const overlap = [...mine].filter((t) => theirs.has(t)).length;
    const sim = mine.size && theirs.size ? overlap / Math.min(mine.size, theirs.size) : 0;
    score += Math.round(Math.min(1, sim) * 35);
    why.push(overlap ? `${overlap} matching fault keyword(s)` : "no matching fault description");
    if (!best || score > best.score) best = { c, score, why };
  }
  if (!best) return { is_duplicate: false, matched_ticket: null, confidence: 0.05, reason: "[Mock fixture] No active candidate tickets." };
  const confidence = Math.max(0, Math.min(99, best.score)) / 100;
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

