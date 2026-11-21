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
  "earthquake",
  "large_scale_flooding",
  "person_trapped_in_lift",
  "power_outage",
  "power_surge",
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
  earthquake: "critical",
  large_scale_flooding: "critical",
  person_trapped_in_lift: "critical",
  power_outage: "elevated",
  power_surge: "elevated",
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
  earthquake: "Earthquake or building shaking",
  large_scale_flooding: "Large-scale flooding (several rooms, a whole floor or stairwell)",
  person_trapped_in_lift: "Person trapped in a lift",
  power_outage: "Power outage",
  power_surge: "Power surge (flickering, tripping breakers, damaged devices)",
};

/**
 * Short, student-facing safety advice per hazard, most urgent first. Shown on the
 * confirmation screen and in the confirmation e-mail. Never replaces 112.
 */
export const HAZARD_ADVICE_ORDER: HazardCode[] = [
  "fire_or_smoke", "gas_smell", "carbon_monoxide_alarm", "earthquake", "structural_damage",
  "person_trapped_in_lift", "large_scale_flooding", "serious_active_flooding",
  "water_near_electrical_socket", "electrical_sparks", "exposed_electrical_wiring",
  "power_surge", "power_outage",
];

export const HAZARD_ADVICE: Partial<Record<HazardCode, string>> = {
  fire_or_smoke: "If there is fire or smoke, leave the building now by the stairs, raise the fire alarm and call 112.",
  gas_smell: "Do not use light switches, phones or flames near the smell. Leave the area, open windows if it is safe, and call 112.",
  carbon_monoxide_alarm: "Leave the room and get fresh air straight away. If anyone feels dizzy or sick, call 112.",
  earthquake: "If the shaking continues: drop, cover and hold on. When it stops, leave a damaged building by the stairs and call 112 if anyone is hurt.",
  structural_damage: "Keep away from the damaged ceiling or wall and keep others out of the area.",
  person_trapped_in_lift: "Press the lift's alarm button and stay calm. Do not try to force the doors. If anyone is hurt or unwell, call 112.",
  large_scale_flooding: "Move away from the water, do not touch sockets or switches, and warn others on the floor.",
  serious_active_flooding: "Move away from the water and do not touch sockets or switches.",
  water_near_electrical_socket: "Stay away from the water and the socket. Do not touch either.",
  electrical_sparks: "Do not touch the socket or device. Keep away until staff arrive.",
  exposed_electrical_wiring: "Do not touch the wires and keep others away.",
  power_surge: "If it is safe, unplug your devices. Do not reset breakers yourself.",
  power_outage: "Use a torch, not candles, and do not use the lifts until power is back.",
};

/** The most urgent piece of advice for a set of hazards, or null. */
export function adviceFor(hazards: readonly string[]): string | null {
  for (const h of HAZARD_ADVICE_ORDER) if (hazards.includes(h)) return HAZARD_ADVICE[h] ?? null;
  return null;
}

const WATER = String.raw`(?:water|leak(?:ing|s)?|flood(?:ing|ed)?|wet|drip(?:ping|s)?|puddle|spill(?:ed|ing)?|damp)`;
// Water that is actually spreading (not just "wet" or "damp").
const SPREADING_WATER = String.raw`(?:flood(?:ing|ed|s)?|water (?:is |was )?(?:pouring|gushing|spreading|coming|running|pooling|everywhere|flowing)|leak(?:ing|s)? (?:into|through|across|onto))`;
const SCALE = String.raw`(?:(?:whole|entire|every|all the|all of the) (?:floor|corridor|building|hallway|rooms?|kitchen|basement)|(?:several|multiple|many|other|neighbou?ring) (?:rooms|floors|flats)|stair(?:s|well|case)|lift shaft|elevator shaft|basement|floors? below|downstairs (?:rooms|corridor))`;
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
    // A socket, fuse box etc. that exploded or went bang counts as arcing.
    code: "electrical_sparks",
    pattern: new RegExp(String.raw`\b${ELECTRIC}\b(?:\W+\w+){0,4}?\W+(?:exploded|blew up|went bang|popped loudly)\b`, "i"),
  },
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
  {
    code: "earthquake",
    pattern: /\b(earthquake|tremors?|aftershocks?|(?:building|floor|ground|walls?|whole room) (?:is |was |are |were |started |keeps )?(?:shaking|shook|swaying|trembling))\b/i,
  },
  {
    code: "large_scale_flooding",
    pattern: new RegExp(
      String.raw`\b${SPREADING_WATER}\b(?:\W+\w+){0,8}?\W+${SCALE}\b|\b${SCALE}\b(?:\W+\w+){0,8}?\W+${SPREADING_WATER}\b`,
      "i",
    ),
  },
  {
    code: "person_trapped_in_lift",
    pattern:
      /\b(someone|somebody|people|persons?|students?|we(?:'re| are)?|i(?:'m| am)|my (?:friend|roommate)|a (?:girl|boy|man|woman|resident))\b(?:\W+\w+){0,4}?\W+(stuck|trapped)\b(?:\W+\w+){0,4}?\W+(lifts?|elevators?)\b/i,
  },
  {
    code: "power_outage",
    pattern:
      /\b(power (?:cut|outage|failure)|power (?:is|went|has gone) (?:out|off|down)|blackout|no (?:power|electricity)|(?:the )?(?:whole|entire) (?:floor|building|corridor) (?:is |went |has gone )?(?:dark|without power))\b/i,
  },
  {
    code: "power_surge",
    pattern:
      /\b(power surge|voltage (?:spike|surge)|surge|lights? (?:keep |are |keeps? )?flicker(?:ing)?|(?:breakers?|fuses?|trip switch) (?:keeps?|keep|kept) (?:tripping|blowing|going)|(?:fried|blew|blown|killed) (?:my |our |the )?(?:charger|laptop|fridge|appliances?|devices?|electronics))\b/i,
  },
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
  if (hazards.has("water_near_electrical_socket") || hazards.has("serious_active_flooding") || hazards.has("large_scale_flooding")) hazards.delete("active_water_leak");
  if (hazards.has("large_scale_flooding")) hazards.delete("serious_active_flooding");
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
