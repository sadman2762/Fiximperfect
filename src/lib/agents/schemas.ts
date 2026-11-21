import { z } from "zod";
import { HAZARD_CODES } from "@/lib/safety/rules";
import { PRIORITIES, SAFETY_LEVELS } from "@/types/domain";

/**
 * Output contracts for the specialist agents. `*Wire` schemas are sent to the
 * model as structured-output formats (kept to JSON-Schema features the API
 * supports); `*Checked` schemas add range checks applied after parsing.
 */

const confidence = z.number().describe("Calibrated probability between 0 and 1");
const confidenceChecked = z.number().min(0).max(1);

// Agent 1 — Vision & Classification --------------------------------------------
export const ClassificationWire = z.object({
  category: z.string().describe("Exactly one of the allowed category names"),
  subcategory: z.string().describe("Equipment or problem type, e.g. 'Washing Machine'"),
  asset_code: z.string().nullable().describe("Asset code from the provided list, or null if none applies"),
  issue: z.string().describe("Short description of the fault, e.g. 'Damaged door latch'"),
  title: z.string().describe("Ticket title, max ~80 characters"),
  summary: z.string().describe("One or two neutral sentences describing the problem"),
  confidence,
  image_assessment: z.enum(["not_provided", "consistent", "inconclusive", "inconsistent", "unrelated"]),
  visual_evidence: z.array(z.string()).describe("Only things directly visible in the photograph"),
  inferred_causes: z.array(z.string()).describe("Possible causes, explicitly marked as inference"),
  safety_flags: z.array(z.enum(HAZARD_CODES)),
});
export const ClassificationChecked = ClassificationWire.extend({
  confidence: confidenceChecked,
  title: z.string().min(1).max(160),
  summary: z.string().min(1).max(1000),
});
export type Classification = z.infer<typeof ClassificationChecked>;

// Agent 2 — Safety assessment --------------------------------------------------
export const SafetyWire = z.object({
  safety_level: z.enum(SAFETY_LEVELS),
  detected_hazards: z.array(z.enum(HAZARD_CODES)),
  reason: z.string(),
  observed_evidence: z.array(z.string()),
  requires_immediate_escalation: z.boolean(),
});
export const SafetyChecked = SafetyWire.extend({ reason: z.string().max(1000) });
export type SafetyAssessment = z.infer<typeof SafetyChecked>;

// Agent 3 — Duplicate detection ------------------------------------------------
export const DuplicateWire = z.object({
  is_duplicate: z.boolean(),
  matched_ticket: z.string().nullable().describe("Ticket number of the most similar candidate, or null"),
  confidence: z.number().describe("Probability (0-1) that the new report is the same underlying problem as matched_ticket"),
  reason: z.string(),
});
export const DuplicateChecked = DuplicateWire.extend({ confidence: confidenceChecked, reason: z.string().max(1000) });
export type DuplicateAssessment = z.infer<typeof DuplicateChecked>;

// Agent 4 — Triage & routing ---------------------------------------------------
export const TriageWire = z.object({
  priority: z.enum(PRIORITIES),
  priority_reason: z.string(),
  recommended_team: z.string().describe("Exactly one team name from the provided directory"),
  assignment_reason: z.string(),
});
export const TriageChecked = TriageWire.extend({ priority_reason: z.string().max(1000), assignment_reason: z.string().max(1000) });
export type TriageRecommendation = z.infer<typeof TriageChecked>;

// Shared input context ---------------------------------------------------------
export interface ReportContext {
  description: string;
  additionalDetails?: string | null;
  image?: { base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" } | null;
  buildingName: string;
  floor: number;
  areaName: string;
  /** Always null for location QR codes; kept for reports that already name a machine. */
  asset: { asset_code: string; asset_name: string; category: string } | null;
  /** Optional category the student picked ("what is it about?"). A hint, not a fact. */
  studentCategory?: string | null;
  locationAssets: { asset_code: string; asset_name: string; category: string }[];
  categories: string[];
}

export interface DuplicateCandidate {
  id: string;
  location_id: string;
  ticket_number: string;
  category: string;
  title: string;
  description: string;
  status: string;
  asset_code: string | null;
  asset_name: string | null;
  area_name: string;
  floor: number;
  created_at: string;
  report_descriptions: string[];
}

export interface TeamOption {
  id: string;
  team_name: string;
  responsible_categories: string[];
  open_tickets: number;
  is_manual_review_queue: boolean;
}

