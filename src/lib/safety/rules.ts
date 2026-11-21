import type { Priority, SafetyLevel } from "@/types/domain";

/**
 * Deterministic safety rules. These run on every report regardless of AI mode
 * and their result can only be RAISED by AI assessment, never lowered.
 */

export const HAZARD_CODES = [
  "water_near_electrical_socket",
  "electrical_sparks",
  "exposed_electrical_wiring",
  "fire_or_smoke",
  "gas_smell",
  "carbon_monoxide_alarm",
  "serious_active_flooding",
  "structural_damage",
  "active_water_leak",
  "broken_glass",
  "security_lock_failure",
] as const;
export type HazardCode = (typeof HAZARD_CODES)[number];

export const HAZARD_LEVEL: Record<HazardCode, SafetyLevel> = {
  water_near_electrical_socket: "critical",
  electrical_sparks: "critical",
  exposed_electrical_wiring: "critical",
  fire_or_smoke: "critical",
  gas_smell: "critical",
  carbon_monoxide_alarm: "critical",
  serious_active_flooding: "critical",
  structural_damage: "critical",
  active_water_leak: "elevated",
  broken_glass: "elevated",
  security_lock_failure: "elevated",
};

export const HAZARD_LABEL: Record<HazardCode, string> = {
  water_near_electrical_socket: "Water near an electrical socket or fitting",
  electrical_sparks: "Electrical sparks or arcing",
  exposed_electrical_wiring: "Exposed electrical wiring",
  fire_or_smoke: "Fire, smoke or burning smell",
  gas_smell: "Smell of gas",
  carbon_monoxide_alarm: "Carbon monoxide alarm",
  serious_active_flooding: "Serious active flooding",
  structural_damage: "Structural damage (ceiling/wall collapse)",
  active_water_leak: "Active water leak",
  broken_glass: "Broken glass",
  security_lock_failure: "Entrance/security lock failure",
};

const WATER = String.raw`(?:water|leak(?:ing|s)?|flood(?:ing|ed)?|wet|drip(?:ping|s)?|puddle|spill(?:ed|ing)?|damp)`;
const ELECTRIC = String.raw`(?:sockets?|outlets?|plug sockets?|electric(?:al|ity)?|wiring|wires?|power ?strip|extension (?:lead|cord)|fuse ?box|switch(?:es)?|light fitting|consumer unit|breaker)`;

interface Rule {
  code: HazardCode;
  pattern: RegExp;
}

const RULES: Rule[] = [
  // Water and electricity within ~8 words of each other, in either order.
  {
    code: "water_near_electrical_socket",
    pattern: new RegExp(String.raw`\b${WATER}\b(?:\W+\w+){0,8}?\W+${ELECTRIC}\b|\b${ELECTRIC}\b(?:\W+\w+){0,8}?\W+${WATER}\b`, "i"),
  },
  { code: "electrical_sparks", pattern: /\b(spark(?:s|ing|ed)?|arcing|electric(?:al)? shock|got (?:a )?shock(?:ed)?|shocked me)\b/i },
  {
    code: "exposed_electrical_wiring",
    pattern: /\b(exposed|bare|hanging|loose|frayed|stripped)\s+(?:\w+\s+){0,2}(wires?|wiring|cables?)\b|\b(wires?|wiring|cables?)\s+(?:\w+\s+){0,2}(exposed|sticking out|hanging out)\b/i,
  },
  {
    code: "fire_or_smoke",
    pattern: /\b(fire|flames?|smoke|smoking|smouldering|smoldering|burning smell|smell(?:s)? (?:of )?burning|melt(?:ed|ing) (?:plug|socket|cable)|scorch(?:ed|ing))\b/i,
  },
  { code: "gas_smell", pattern: /\b(gas (?:smell|leak)|smell(?:s|ing)? (?:of )?gas)\b/i },
  { code: "carbon_monoxide_alarm", pattern: /\b(carbon monoxide|co alarm|co detector)\b/i },
  {
    code: "serious_active_flooding",
    pattern: /\b(flood(?:ing|ed)?|burst pipe|pipe (?:has )?burst|water (?:is )?(?:pouring|gushing|everywhere)|ankle[- ]deep|water coming through the ceiling)\b/i,
  },
  { code: "structural_damage", pattern: /\b(ceiling (?:has )?(?:collapsed|fell|falling|caving)|wall (?:has )?collapsed|structural crack)\b/i },
  { code: "active_water_leak", pattern: /\b(leak(?:ing|s)?|dripping|water (?:on|under) the floor)\b/i },
  { code: "broken_glass", pattern: /\b(broken|shattered|smashed|cracked)\s+(?:\w+\s+){0,2}(glass|window|mirror)\b/i },
  { code: "security_lock_failure", pattern: /\b(front|main|entrance|fire) door\b.*\b(won'?t|does ?n[o']t|can'?t|cannot) (?:lock|close|shut)\b/i },
];

const NEGATION = /\b(no|not|without|never|isn'?t|aren'?t|wasn'?t|nothing like)\s+(?:\w+\s+){0,2}$/i;

function matchesWithoutNegation(text: string, pattern: RegExp): boolean {
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    if (!NEGATION.test(before)) return true;
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return false;
}

export interface RuleAssessment {
  level: SafetyLevel;
  hazards: HazardCode[];
  matchedBy: ("text_rule" | "ai_flag")[];
}

const LEVEL_ORDER: SafetyLevel[] = ["none", "low", "elevated", "critical"];
export const maxLevel = (a: SafetyLevel, b: SafetyLevel): SafetyLevel =>
  LEVEL_ORDER.indexOf(a) >= LEVEL_ORDER.indexOf(b) ? a : b;

/**
 * Applies deterministic rules to the student's text and to hazard flags that a
 * vision model extracted (flags are mapped through a fixed table — the model
 * cannot introduce new hazard types or choose a level).
 */
export function evaluateSafetyRules(text: string, aiHazardFlags: string[] = []): RuleAssessment {
  const hazards = new Set<HazardCode>();
  const matchedBy = new Set<"text_rule" | "ai_flag">();
  for (const rule of RULES) {
    if (matchesWithoutNegation(text, rule.pattern)) {
      hazards.add(rule.code);
      matchedBy.add("text_rule");
    }
  }
  for (const flag of aiHazardFlags) {
    if ((HAZARD_CODES as readonly string[]).includes(flag)) {
      hazards.add(flag as HazardCode);
      matchedBy.add("ai_flag");
    }
  }
  // A leak that is already classified as flooding/water-near-electric is subsumed.
  if (hazards.has("water_near_electrical_socket") || hazards.has("serious_active_flooding")) hazards.delete("active_water_leak");
  let level: SafetyLevel = "none";
  for (const h of hazards) level = maxLevel(level, HAZARD_LEVEL[h]);
  return { level, hazards: [...hazards], matchedBy: [...matchedBy] };
}

export interface CombinedSafety {
  safety_level: SafetyLevel;
  detected_hazards: HazardCode[];
  reason: string;
  requires_immediate_escalation: boolean;
  rule_level: SafetyLevel;
  ai_level: SafetyLevel | null;
  decided_by: "rules" | "ai" | "rules_and_ai" | "none";
}

/**
 * Final safety decision = the higher of the rule level and the AI level.
 * A critical rule result can never be downgraded by the AI.
 */
export function combineSafety(
  rules: RuleAssessment,
  ai: { safety_level: SafetyLevel; detected_hazards: string[]; reason: string; requires_immediate_escalation: boolean } | null,
): CombinedSafety {
  // An AI "critical" without an explicit escalation request is treated as elevated.
  const aiLevel: SafetyLevel | null = ai
    ? ai.safety_level === "critical" && !ai.requires_immediate_escalation
      ? "elevated"
      : ai.safety_level
    : null;
  const aiHazards = (ai?.detected_hazards ?? []).filter((h): h is HazardCode => (HAZARD_CODES as readonly string[]).includes(h));
  const level = maxLevel(rules.level, aiLevel ?? "none");
  const hazards = [...new Set([...rules.hazards, ...aiHazards])];
  const ruleWins = LEVEL_ORDER.indexOf(rules.level) >= LEVEL_ORDER.indexOf(aiLevel ?? "none");
  const decidedBy =
    level === "none" ? "none" : rules.level === level && aiLevel === level ? "rules_and_ai" : ruleWins ? "rules" : "ai";
  const reasonParts: string[] = [];
  if (rules.hazards.length) reasonParts.push(`Safety rules matched: ${rules.hazards.map((h) => HAZARD_LABEL[h]).join(", ")}.`);
  if (ai?.reason) reasonParts.push(`AI assessment: ${ai.reason}`);
  return {
    safety_level: level,
    detected_hazards: hazards,
    reason: reasonParts.join(" ") || "No safety hazard identified.",
    requires_immediate_escalation: level === "critical",
    rule_level: rules.level,
    ai_level: aiLevel,
    decided_by: decidedBy,
  };
}

const PRIORITY_ORDER: Priority[] = ["low", "medium", "high", "critical"];
export const maxPriority = (a: Priority, b: Priority): Priority =>
  PRIORITY_ORDER.indexOf(a) >= PRIORITY_ORDER.indexOf(b) ? a : b;

/** Minimum priority implied by a safety level. */
export function priorityFloorForSafety(level: SafetyLevel): Priority {
  if (level === "critical") return "critical";
  if (level === "elevated") return "high";
  return "low";
}
