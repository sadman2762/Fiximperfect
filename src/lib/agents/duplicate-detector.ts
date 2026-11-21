import "server-only";
import { callStructured, untrusted, UNTRUSTED_INPUT_POLICY, type AgentResult } from "@/lib/ai/client";
import { aiConfig } from "@/lib/env";
import { mockDuplicate } from "@/lib/agents/mock/fixtures";
import { DuplicateChecked, DuplicateWire, type DuplicateAssessment, type DuplicateCandidate } from "@/lib/agents/schemas";

const SYSTEM = `You are the Duplicate Detection Agent of Fiximperfect. Several students may report the same underlying
maintenance problem. Compare one NEW report with a short list of ACTIVE candidate tickets retrieved from the database
(same building, nearby location or same asset, recent).

QR codes identify a room or shared space, not a machine, so one room can hold several unrelated problems.
Decide whether the new report describes the SAME underlying problem as one candidate — the same location, the same kind of
equipment (category) and the same fault; the same machine when both name one. Different wording for the same fault is a
duplicate ("door is broken" vs "won't close" vs "latch damaged"). A broken washer and a broken fridge in the same room,
a different fault on the same equipment, or the same fault on a different machine are NOT duplicates.

Return the candidate's ticket number in matched_ticket (or null), a calibrated confidence, and a one-sentence reason that
names the evidence (asset, location, fault, timing). Be conservative: uncertain matches are reviewed by a human.

${UNTRUSTED_INPUT_POLICY}`;

export interface NewReportForDedupe {
  description: string;
  category: string;
  issue: string;
  asset_code: string | null;
  asset_name: string | null;
  location_id?: string | null;
  area_name: string;
  floor: number;
  submitted_at: string;
}

export async function detectDuplicate(
  report: NewReportForDedupe,
  candidates: DuplicateCandidate[],
): Promise<AgentResult<DuplicateAssessment>> {
  if (candidates.length === 0) {
    return {
      output: { is_duplicate: false, matched_ticket: null, confidence: 0, reason: "No active related tickets were found." },
      mode: aiConfig().mode,
      model: null,
      latencyMs: 0,
    };
  }
  let result: AgentResult<DuplicateAssessment>;
  if (aiConfig().mode === "mock") {
    result = { output: DuplicateChecked.parse(mockDuplicate(report, candidates)), mode: "mock", model: null, latencyMs: 0 };
  } else {
    const list = candidates
      .map(
        (c) => `<candidate ticket="${c.ticket_number}">
status: ${c.status}; category: ${c.category}; created: ${c.created_at}
asset: ${c.asset_code ? `${c.asset_code} (${c.asset_name})` : "none"}; location: floor ${c.floor}, ${c.area_name}; same location as new report: ${report.location_id && c.location_id === report.location_id ? "yes" : "no"}
title: ${c.title}
${untrusted("student_reports", c.report_descriptions.map((d) => `- ${d}`).join("\n"))}
</candidate>`,
      )
      .join("\n");
    const res = await callStructured({
      agent: "duplicate_detection",
      system: SYSTEM,
      content: [
        {
          type: "text",
          text: `NEW REPORT
submitted: ${report.submitted_at}; classified category: ${report.category}; issue: ${report.issue}
asset: ${report.asset_code ? `${report.asset_code} (${report.asset_name})` : "none"}; location: floor ${report.floor}, ${report.area_name}
${untrusted("student_description", report.description)}

ACTIVE CANDIDATE TICKETS
${list}

Is the new report a duplicate of one of these candidates?`,
        },
      ],
      schema: DuplicateWire,
      effort: "low",
    });
    result = { ...res, output: DuplicateChecked.parse(res.output) };
  }
  // The model may only reference a ticket that was actually provided.
  const out = result.output;
  if (out.matched_ticket && !candidates.some((c) => c.ticket_number === out.matched_ticket)) {
    result.output = { is_duplicate: false, matched_ticket: null, confidence: 0, reason: "Model referenced an unknown ticket; ignored." };
  }
  return result;
}
