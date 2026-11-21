import "server-only";
import { callStructured, UNTRUSTED_INPUT_POLICY, type AgentResult } from "@/lib/ai/client";
import { aiConfig } from "@/lib/env";
import { mockSafety } from "@/lib/agents/mock/fixtures";
import { reportContent } from "@/lib/agents/vision-classifier";
import { SafetyChecked, SafetyWire, type ReportContext, type SafetyAssessment } from "@/lib/agents/schemas";

const SYSTEM = `You are the Safety Assessment Agent of Fiximperfect. Decide whether a dormitory maintenance report describes an
immediate risk to people. Examples of critical hazards: water near electrical sockets or fittings, sparks or arcing,
exposed wiring, fire/smoke/burning smell, gas smell, carbon monoxide alarms, serious active flooding, structural collapse.

Levels:
- critical: a plausible immediate danger to people; staff must be alerted now (requires_immediate_escalation = true).
- elevated: a hazard that should be handled quickly but is not an immediate danger (e.g. a contained leak, broken glass).
- low: minor safety relevance.
- none: no safety concern.

Base the assessment on what the description states and what the photo shows. List observed_evidence only for things
actually stated or visible. When evidence of a serious hazard is ambiguous, err on the side of safety and explain why.
Server-side rules are applied in addition to your assessment; you cannot lower their result.

${UNTRUSTED_INPUT_POLICY}`;

export async function assessSafety(ctx: ReportContext): Promise<AgentResult<SafetyAssessment>> {
  if (aiConfig().mode === "mock") {
    return { output: SafetyChecked.parse(mockSafety(ctx)), mode: "mock", model: null, latencyMs: 0 };
  }
  const res = await callStructured({
    agent: "safety",
    system: SYSTEM,
    content: reportContent(ctx, "Assess the safety risk of this report."),
    schema: SafetyWire,
    effort: "medium",
  });
  return { ...res, output: SafetyChecked.parse(res.output) };
}
