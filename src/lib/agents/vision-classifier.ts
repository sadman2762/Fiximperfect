import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { callStructured, untrusted, UNTRUSTED_INPUT_POLICY, type AgentResult } from "@/lib/ai/client";
import { aiConfig } from "@/lib/env";
import { mockClassify } from "@/lib/agents/mock/fixtures";
import { ClassificationChecked, ClassificationWire, type Classification, type ReportContext } from "@/lib/agents/schemas";

const SYSTEM = `You are the Vision and Classification Agent of Fiximperfect, a university dormitory maintenance platform.
You receive one student maintenance report: a text description, optional details, an optional photograph, and the
location/asset context resolved from the QR code the student scanned (this context is trusted).

Your job:
- Classify the problem into exactly one of the allowed categories (use the exact name).
- Identify the affected equipment if the report makes clear which registered machine it is (e.g. "washer number 3").
  If it is ambiguous, return null. Only ever return an asset code from the provided list, or null.
- Describe the fault in a few words ("issue") and write a short neutral title and summary.
- visual_evidence must list only what is directly visible in the photograph. Put possible causes in inferred_causes and
  phrase them as possibilities. If no photo was provided, visual_evidence is empty and image_assessment is "not_provided".
- If the photo is blurry, ambiguous or does not clearly show the problem, set image_assessment to "inconclusive" and
  lower your confidence. If it shows something unrelated to the description, use "unrelated" or "inconsistent".
- safety_flags: list any hazards from the allowed codes that the description or image indicates. Do not guess.
- confidence: your calibrated probability that category and issue are correct. Do not claim certainty you do not have.

${UNTRUSTED_INPUT_POLICY}`;

export function buildContextBlock(ctx: ReportContext): string {
  const assetLine = ctx.asset
    ? `Equipment already identified: ${ctx.asset.asset_code} — ${ctx.asset.asset_name} (category: ${ctx.asset.category})`
    : "The QR code identifies the room or shared space, not a specific piece of equipment.";
  const hint = ctx.studentCategory ? `\nThe student says it is about: ${ctx.studentCategory} (a hint; trust the description and photo if they disagree).` : "";
  const assets = ctx.locationAssets.map((a) => `- ${a.asset_code}: ${a.asset_name} (${a.category})`).join("\n") || "- none registered";
  return `Location (trusted, from QR code): ${ctx.buildingName}, floor ${ctx.floor}, ${ctx.areaName}
${assetLine}
Assets registered at this location:
${assets}
Allowed categories: ${ctx.categories.join(", ")}${hint}`;
}

export function reportContent(ctx: ReportContext, instruction: string): Anthropic.Beta.Messages.BetaContentBlockParam[] {
  const blocks: Anthropic.Beta.Messages.BetaContentBlockParam[] = [];
  if (ctx.image) {
    blocks.push({ type: "image", source: { type: "base64", media_type: ctx.image.mediaType, data: ctx.image.base64 } });
  }
  blocks.push({
    type: "text",
    text: `${buildContextBlock(ctx)}

${untrusted("student_description", ctx.description)}
${ctx.additionalDetails ? untrusted("student_additional_details", ctx.additionalDetails) : ""}
Photograph provided: ${ctx.image ? "yes (attached above)" : "no"}

${instruction}`,
  });
  return blocks;
}

export async function classifyReport(ctx: ReportContext): Promise<AgentResult<Classification>> {
  if (aiConfig().mode === "mock") {
    return { output: ClassificationChecked.parse(mockClassify(ctx)), mode: "mock", model: null, latencyMs: 0 };
  }
  const res = await callStructured({
    agent: "classification",
    system: SYSTEM,
    content: reportContent(ctx, "Classify this report."),
    schema: ClassificationWire,
    effort: "medium",
  });
  const output = ClassificationChecked.parse(res.output);
  // Post-validation: never accept categories or assets outside the trusted lists.
  const allowedAssets = new Set([ctx.asset?.asset_code, ...ctx.locationAssets.map((a) => a.asset_code)].filter(Boolean));
  if (output.asset_code && !allowedAssets.has(output.asset_code)) output.asset_code = ctx.asset?.asset_code ?? null;
  if (!ctx.categories.includes(output.category)) {
    output.category = ctx.categories.includes("General") ? "General" : ctx.categories[0];
    output.confidence = Math.min(output.confidence, 0.4);
  }
  return { ...res, output };
}

