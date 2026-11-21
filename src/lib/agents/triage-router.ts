import "server-only";
import { callStructured, untrusted, UNTRUSTED_INPUT_POLICY, type AgentResult } from "@/lib/ai/client";
import { aiConfig } from "@/lib/env";
import { mockTriage } from "@/lib/agents/mock/fixtures";
import { TriageChecked, TriageWire, type Classification, type TeamOption, type TriageRecommendation } from "@/lib/agents/schemas";
import type { CombinedSafety } from "@/lib/safety/rules";

const SYSTEM = `You are the Triage and Routing Agent of Fiximperfect. Given a classified dormitory maintenance problem, its
safety assessment and the maintenance team directory, recommend a priority and the responsible team.

Priority guidance:
- critical: immediate danger to people (critical safety level) — always critical.
- high: essential service unavailable for many residents (no heating/hot water, all washers down, active leak), or an
  elevated safety level.
- medium: single appliance or room-level problem with workarounds (one washer out of several, one fridge).
- low: cosmetic or minor inconvenience.

Team rules:
- recommended_team MUST be exactly one team name from the directory. Never invent a team.
- Prefer the team whose responsible categories include the problem category. The routing rule from the database is
  given; follow it unless there is a clear reason not to, and explain any deviation.
- Consider current workload only as a tie-breaker between teams that are responsible for the category.

${UNTRUSTED_INPUT_POLICY}`;

export async function recommendTriage(input: {
  classification: Classification;
  safety: CombinedSafety;
  description: string;
  buildingName: string;
  areaName: string;
  floor: number;
  assetName: string | null;
  teams: TeamOption[];
  ruleTeam: string | null;
}): Promise<AgentResult<TriageRecommendation>> {
  if (aiConfig().mode === "mock") {
    return {
      output: TriageChecked.parse(mockTriage(input.classification, input.safety.safety_level, input.teams, input.ruleTeam)),
      mode: "mock",
      model: null,
      latencyMs: 0,
    };
  }
  const directory = input.teams
    .map((t) => `- ${t.team_name}: responsible for ${t.responsible_categories.join(", ") || "manual review"}; open tickets: ${t.open_tickets}`)
    .join("\n");
  const res = await callStructured({
    agent: "triage_routing",
    system: SYSTEM,
    content: [
      {
        type: "text",
        text: `Problem: category ${input.classification.category} / ${input.classification.subcategory}; issue: ${input.classification.issue}
Asset: ${input.assetName ?? "none"}; location: ${input.buildingName}, floor ${input.floor}, ${input.areaName}
Safety: ${input.safety.safety_level} — ${input.safety.reason}
${untrusted("student_description", input.description)}

Team directory:
${directory}
Database routing rule for this category and building: ${input.ruleTeam ?? "none defined"}

Recommend priority and team.`,
      },
    ],
    schema: TriageWire,
    effort: "low",
  });
  return { ...res, output: TriageChecked.parse(res.output) };
}

