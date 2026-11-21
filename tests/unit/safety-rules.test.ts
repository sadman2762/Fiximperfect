import { describe, expect, it } from "vitest";
import { adviceFor, combineSafety, evaluateSafetyRules, maxPriority, priorityFloorForSafety } from "@/lib/safety/rules";

describe("deterministic safety rules", () => {
  it.each([
    "There is water near an electrical socket.",
    "There is water leaking beside an electrical socket",
    "The socket by the sink is wet and dripping",
    "I saw sparks coming from the plug socket",
    "Exposed wires hanging from the ceiling light",
    "Smoke is coming out of the dryer",
    "There's a strong smell of gas in the kitchen",
    "Burst pipe, water pouring into the corridor",
  ])("flags a critical hazard: %s", (text) => {
    expect(evaluateSafetyRules(text).level).toBe("critical");
  });

  it.each([
    "The washing machine door is broken.",
    "Washer number 3 will not close.",
    "The wifi in the common room is slow",
    "Desk drawer is stuck",
    "The sink plug is missing and water drains slowly",
  ])("does not escalate an ordinary issue: %s", (text) => {
    expect(evaluateSafetyRules(text).level).not.toBe("critical");
  });

  it("respects simple negation", () => {
    expect(evaluateSafetyRules("No sparks or smoke, the lamp just doesn't turn on").level).toBe("none");
  });

  it("maps AI vision hazard flags through the fixed table only", () => {
    const r = evaluateSafetyRules("The floor is a bit dirty", ["exposed_electrical_wiring", "made_up_hazard"]);
    expect(r.level).toBe("critical");
    expect(r.hazards).toEqual(["exposed_electrical_wiring"]);
    expect(r.matchedBy).toEqual(["ai_flag"]);
  });
});

describe("combining rules with AI assessment", () => {
  const rulesCritical = evaluateSafetyRules("water near an electrical socket");

  it("never lets a lower AI assessment override a critical rule", () => {
    const c = combineSafety(rulesCritical, { safety_level: "none", detected_hazards: [], reason: "Looks fine", requires_immediate_escalation: false });
    expect(c.safety_level).toBe("critical");
    expect(c.requires_immediate_escalation).toBe(true);
    expect(c.decided_by).toBe("rules");
  });

  it("lets AI raise the level above rules", () => {
    const c = combineSafety(evaluateSafetyRules("strange noise from the wall"), {
      safety_level: "critical",
      detected_hazards: ["electrical_sparks"],
      reason: "Photo shows arcing",
      requires_immediate_escalation: true,
    });
    expect(c.safety_level).toBe("critical");
    expect(c.decided_by).toBe("ai");
  });

  it("treats an AI 'critical' without an escalation request as elevated", () => {
    const c = combineSafety(evaluateSafetyRules("door squeaks"), { safety_level: "critical", detected_hazards: [], reason: "?", requires_immediate_escalation: false });
    expect(c.safety_level).toBe("elevated");
  });

  it("falls back to rules when AI is unavailable", () => {
    expect(combineSafety(rulesCritical, null).safety_level).toBe("critical");
  });

  it("derives a priority floor from safety", () => {
    expect(maxPriority("low", priorityFloorForSafety("critical"))).toBe("critical");
    expect(maxPriority("medium", priorityFloorForSafety("elevated"))).toBe("high");
    expect(maxPriority("high", priorityFloorForSafety("none"))).toBe("high");
  });
});

describe("new emergency types", () => {
  it.each([
    ["There was an earthquake and the walls are cracked", "earthquake", "critical"],
    ["The whole building is shaking", "earthquake", "critical"],
    ["Water is pouring down the stairwell from the 3rd floor", "large_scale_flooding", "critical"],
    ["The entire corridor is flooded and it's spreading to several rooms", "large_scale_flooding", "critical"],
    ["Someone is stuck in the lift between floors 2 and 3", "person_trapped_in_lift", "critical"],
    ["We are trapped inside the elevator", "person_trapped_in_lift", "critical"],
    ["Power cut on the whole second floor", "power_outage", "elevated"],
    ["The entire building is dark, no electricity since 8pm", "power_outage", "elevated"],
    ["The lights keep flickering and the breaker keeps tripping", "power_surge", "elevated"],
    ["There was a power surge and it fried my charger", "power_surge", "elevated"],
    ["The fuse box went bang and there was a flash", "electrical_sparks", "critical"],
  ] as const)("detects %s", (text, hazard, level) => {
    const r = evaluateSafetyRules(text);
    expect(r.hazards).toContain(hazard);
    expect(r.level).toBe(level);
  });

  it.each([
    "The stairs are wet after cleaning",
    "The lift is out of order on floor 4",
    "My desk lamp bulb is dead",
    "There is a small damp patch in the basement corner",
  ])("does not make an emergency of: %s", (text) => {
    expect(evaluateSafetyRules(text).level).not.toBe("critical");
  });

  it("reports large-scale flooding instead of a plain leak or local flooding", () => {
    const r = evaluateSafetyRules("Flooding across the whole floor, a pipe is leaking");
    expect(r.hazards).toContain("large_scale_flooding");
    expect(r.hazards).not.toContain("active_water_leak");
    expect(r.hazards).not.toContain("serious_active_flooding");
  });

  it("returns the most urgent advice first, and nothing for hazards without advice", () => {
    expect(adviceFor(["power_outage", "fire_or_smoke"])).toMatch(/leave the building/i);
    expect(adviceFor(["broken_glass"])).toBeNull();
  });
});
