import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/supabase/admin";
import { resolveQr } from "@/lib/assets/qr";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { appUrl, aiConfig } from "@/lib/env";
import { loadSettings, type AppSettings } from "@/lib/settings";
import { storeReportImage, validateImage, type ImageMediaType } from "@/lib/storage/images";
import { classifyReport } from "@/lib/agents/vision-classifier";
import { assessSafety } from "@/lib/agents/safety-assessor";
import { detectDuplicate } from "@/lib/agents/duplicate-detector";
import { recommendTriage } from "@/lib/agents/triage-router";
import { recordAiRun } from "@/lib/ai/client";
import type { Classification, DuplicateAssessment, ReportContext, SafetyAssessment, TriageRecommendation } from "@/lib/agents/schemas";
import { adviceFor, combineSafety, evaluateSafetyRules, maxPriority, priorityFloorForSafety, type CombinedSafety } from "@/lib/safety/rules";
import { retrieveCandidates } from "@/lib/duplicate-detection/candidates";
import { decideLink, type LinkDecision } from "@/lib/duplicate-detection/decision";
import { loadRoutingDirectory, resolveRouting, type RoutingDecision } from "@/lib/routing/router";
import { triggerEmergency } from "@/lib/workflows/emergency";
import { sendNotification } from "@/lib/notifications/dispatcher";
import { reportReceived, staffTicketAlert } from "@/lib/notifications/templates";
import { caretakersFor, studentEmailContext, ticketUrl } from "@/lib/notifications/recipients";
import type { Priority, QrContext } from "@/types/domain";
import { placeName, fullLocation } from "@/lib/locations/label";

export interface SubmitReportInput {
  qrSlug: string;
  /** Optional equipment category the student picked; a hint for classification. */
  equipmentCategory?: string | null;
  description: string;
  additionalDetails?: string | null;
  reporterName: string;
  reporterEmail: string;
  image?: Uint8Array | null;
  isDemo?: boolean;
}

export interface SubmitReportResult {
  reportId: string;
  reportNumber: string;
  ticketId: string;
  ticketNumber: string;
  ticketStatus: string;
  category: string;
  priority: Priority;
  safetyLevel: string;
  linkStatus: string;
  linkedReports: number;
  trackingUrl: string;
  aiMode: "live" | "mock";
  degraded: boolean;
  hazards: string[];
  safetyAdvice: string | null;
}

export class SubmissionError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

type Agent<T> = { ok: true; output: T; mode: "live" | "mock"; model: string | null; latencyMs: number } | { ok: false; error: string };

async function safely<T>(fn: () => Promise<{ output: T; mode: "live" | "mock"; model: string | null; latencyMs: number }>): Promise<Agent<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Entry point used by the public reporting API, demo scenarios and tests. */
export async function submitReport(input: SubmitReportInput): Promise<SubmitReportResult> {
  const db = adminClient();
  const qr = await resolveQr(db, input.qrSlug);
  if (!qr) throw new SubmissionError("This QR code is not recognised.", 404);

  // A QR code identifies a location only. Equipment is identified later (by the
  // classifier, from the equipment registered in this location) or by staff.
  const equipmentCategory = input.equipmentCategory?.trim() || null;

  let imageType: ImageMediaType | null = null;
  if (input.image && input.image.byteLength > 0) imageType = validateImage(input.image);

  const token = generateToken();
  const { data: report, error } = await db
    .from("reports")
    .insert({
      building_id: qr.building.id,
      location_id: qr.location.id,
      asset_id: null,
      equipment_category: equipmentCategory,
      reporter_name: input.reporterName.trim(),
      reporter_email: input.reporterEmail.trim().toLowerCase(),
      description: input.description.trim(),
      additional_details: input.additionalDetails?.trim() || null,
      tracking_token_hash: hashToken(token),
      processing_status: "processing",
      is_demo: input.isDemo ?? false,
    })
    .select("id, report_number, created_at")
    .single();
  if (error || !report) throw new Error(`could not save report: ${error?.message}`);

  if (input.image && imageType) {
    const path = await storeReportImage(report.id, input.image, imageType);
    await db.from("reports").update({ image_path: path }).eq("id", report.id);
  }

  const trackingUrl = appUrl(`/track/${token}`);
  const outcome = await processReport(db, {
    reportId: report.id,
    reportNumber: report.report_number,
    submittedAt: report.created_at,
    qr,
    assetId: null,
    equipmentCategory,
    description: input.description.trim(),
    additionalDetails: input.additionalDetails?.trim() || null,
    image: input.image && imageType ? { base64: Buffer.from(input.image).toString("base64"), mediaType: imageType } : null,
  });

  // Notifications (student confirmation + caretakers). Failures are recorded, never fatal.
  const tpl = reportReceived({ ...(await studentEmailContext(db, report.id, trackingUrl)), safetyAdvice: outcome.safetyAdvice });
  const notifications: Promise<unknown>[] = [
    sendNotification({
      audience: "student",
      channel: "email",
      recipient: input.reporterEmail.trim().toLowerCase(),
      type: "report_received",
      ...tpl,
      secureLinks: [trackingUrl],
      ticketId: outcome.ticketId,
      reportId: report.id,
    }),
  ];
  if (outcome.safetyLevel !== "critical") {
    const caretakers = await caretakersFor(db, qr.building.id);
    const kind = outcome.linkStatus === "auto_linked" ? "Additional report linked" : outcome.ticketStatus === "needs_review" ? "Ticket needs review" : "New ticket";
    const detail =
      outcome.linkStatus === "auto_linked"
        ? `${outcome.linkedReports} reports are now linked to this ticket.`
        : `Priority ${outcome.priority}. ${outcome.routingReason}`;
    for (const c of caretakers) {
      const staffTpl = staffTicketAlert({
        kind,
        ticketNumber: outcome.ticketNumber,
        title: outcome.title,
        location: fullLocation(qr.building.name, qr.location),
        detail,
        url: ticketUrl(outcome.ticketId),
      });
      notifications.push(
        sendNotification({
          audience: "caretaker",
          channel: "email",
          recipient: c.email,
          type: outcome.linkStatus === "auto_linked" ? "report_linked" : "new_ticket",
          ...staffTpl,
          ticketId: outcome.ticketId,
          reportId: report.id,
        }),
      );
    }
  }
  await Promise.allSettled(notifications);

  return { reportId: report.id, reportNumber: report.report_number, trackingUrl, ...outcome };
}

interface ProcessInput {
  reportId: string;
  reportNumber: string;
  submittedAt: string;
  qr: QrContext;
  assetId: string | null;
  equipmentCategory?: string | null;
  description: string;
  additionalDetails: string | null;
  image: ReportContext["image"];
}

/**
 * The AI workflow. Agents run in two parallel rounds:
 *   1. Vision/classification + safety assessment
 *   2. Duplicate detection + triage/routing
 * Each agent's output is validated; failures degrade to deterministic rules and
 * human review rather than blocking the report. Critical safety bypasses the
 * queue and starts the emergency workflow before notifications are sent.
 */
export async function processReport(db: SupabaseClient, p: ProcessInput) {
  const settings = await loadSettings(db);
  const { data: cats } = await db.from("categories").select("name").order("name");
  const categories = (cats ?? []).map((c) => c.name as string);

  const selectedAsset = p.assetId ? (p.qr.locationAssets.find((a) => a.id === p.assetId) ?? null) : null;
  const studentCategory = p.equipmentCategory && categories.includes(p.equipmentCategory) ? p.equipmentCategory : null;
  const place = placeName(p.qr.location);
  const ctx: ReportContext = {
    description: p.description,
    additionalDetails: p.additionalDetails,
    image: p.image,
    buildingName: p.qr.building.name,
    floor: p.qr.location.floor,
    areaName: place,
    studentCategory,
    asset: selectedAsset ? { asset_code: selectedAsset.asset_code, asset_name: selectedAsset.asset_name, category: selectedAsset.category } : null,
    locationAssets: p.qr.locationAssets.map((a) => ({ asset_code: a.asset_code, asset_name: a.asset_name, category: a.category })),
    categories,
  };

  // Round 1 ---------------------------------------------------------------------
  const [cls, saf] = await Promise.all([safely(() => classifyReport(ctx)), safely(() => assessSafety(ctx))]);
  const classification: Classification | null = cls.ok ? cls.output : null;
  const aiSafety: SafetyAssessment | null = saf.ok ? saf.output : null;

  const text = `${p.description} ${p.additionalDetails ?? ""}`;
  const rules = evaluateSafetyRules(text, classification?.safety_flags ?? []);
  const safety: CombinedSafety = combineSafety(rules, aiSafety);

  const category = classification?.category ?? studentCategory ?? selectedAsset?.category ?? (categories.includes("General") ? "General" : categories[0]);
  const lowConfidence = !classification || classification.confidence < settings.classification_review_threshold;

  // An asset chosen by the classifier from the location's registered assets.
  let assetId = p.assetId;
  let assetName = selectedAsset?.asset_name ?? null;
  let assetCode = selectedAsset?.asset_code ?? null;
  if (!assetId && classification?.asset_code) {
    const match = p.qr.locationAssets.find((a) => a.asset_code === classification.asset_code);
    if (match) {
      assetId = match.id;
      assetName = match.asset_name;
      assetCode = match.asset_code;
      await db.from("reports").update({ asset_id: assetId }).eq("id", p.reportId);
    }
  }

  // Round 2 ---------------------------------------------------------------------
  const candidateParams = {
    buildingId: p.qr.building.id,
    locationId: p.qr.location.id,
    floor: p.qr.location.floor,
    assetId,
    category,
    windowDays: settings.duplicate_window_days,
  };
  const dedupeInput = {
    description: p.description,
    category,
    issue: classification?.issue ?? p.description.slice(0, 80),
    asset_code: assetCode,
    asset_name: assetName,
    location_id: p.qr.location.id,
    area_name: place,
    floor: p.qr.location.floor,
    submitted_at: p.submittedAt,
  };

  const directory = await loadRoutingDirectory(db, category, p.qr.building.id);
  let candidates = await retrieveCandidates(db, candidateParams);
  const [dup, tri] = await Promise.all([
    safely(() => detectDuplicate(dedupeInput, candidates)),
    classification
      ? safely(() =>
          recommendTriage({
            classification,
            safety,
            description: p.description,
            buildingName: p.qr.building.name,
            areaName: place,
            floor: p.qr.location.floor,
            assetName,
            teams: directory.teams,
            ruleTeam: directory.ruleTeamName,
          }),
        )
      : Promise.resolve<Agent<TriageRecommendation>>({ ok: false, error: "classification unavailable" }),
  ]);

  const thresholds = { autoLink: settings.duplicate_auto_link_threshold, review: settings.duplicate_review_threshold };
  let duplicate: DuplicateAssessment | null = dup.ok ? dup.output : null;
  let decision: LinkDecision = duplicate
    ? decideLink(duplicate, thresholds)
    : candidates.length
      ? { decision: "review", matchedTicketNumber: candidates[0].ticket_number, confidence: 0, reason: "Duplicate detection unavailable; possible related ticket requires review." }
      : { decision: "new", matchedTicketNumber: null, confidence: 0, reason: "No related active tickets." };

  const triage: TriageRecommendation | null = tri.ok ? tri.output : null;
  const routing: RoutingDecision = resolveRouting(directory, category, triage?.recommended_team ?? null, triage?.assignment_reason ?? null);
  const basePriority = (triage?.priority ?? (directory.categoryDefaultPriority as Priority | null) ?? "medium") as Priority;
  const priority = maxPriority(basePriority, priorityFloorForSafety(safety.safety_level));
  const priorityReason =
    priority !== basePriority
      ? `Raised to ${priority} by safety assessment (${safety.safety_level}). ${triage?.priority_reason ?? ""}`.trim()
      : (triage?.priority_reason ?? `Default priority for ${category}.`);

  const degradedReasons = [
    !cls.ok && `classification failed (${cls.error})`,
    !saf.ok && `AI safety assessment failed (${saf.error}); deterministic rules applied`,
    !dup.ok && `duplicate detection failed (${dup.error})`,
    !tri.ok && `triage failed (${tri.error}); routing rules applied`,
  ].filter(Boolean) as string[];
  const needsReviewReason = [
    lowConfidence && classification && `Low classification confidence (${Math.round(classification.confidence * 100)}%).`,
    !classification && "AI classification unavailable.",
    classification?.image_assessment === "inconsistent" && "Photo appears inconsistent with the description.",
    routing.needsReview && routing.reason,
  ]
    .filter(Boolean)
    .join(" ");

  // Link or create, with concurrency-safe retries --------------------------------
  type AttachResult = { status: string; ticket_id: string; ticket_number?: string; ticket_status?: string; escalate?: boolean };
  let attach: AttachResult | null = null as AttachResult | null;
  for (let retry = 0; retry <= 2; retry++) {
    const matched = decision.matchedTicketNumber ? candidates.find((c) => c.ticket_number === decision.matchedTicketNumber) : null;
    const { data, error } = await db.rpc("attach_report_to_ticket", {
      p: {
        report_id: p.reportId,
        decision: decision.decision,
        matched_ticket_id: matched?.id ?? null,
        candidate_ids: candidates.map((c) => c.id),
        confidence: decision.confidence,
        reason: decision.reason,
        retry_count: retry,
        ai_mode: aiConfig().mode,
        ticket: {
          category,
          subcategory: classification?.subcategory ?? null,
          title: classification?.title ?? `${assetName ?? place}: ${p.description.slice(0, 80)}`,
          description: classification?.summary ?? p.description,
          priority,
          priority_reason: priorityReason,
          safety_level: safety.safety_level,
          safety_reason: safety.safety_level === "none" ? null : safety.reason,
          assigned_team_id: routing.needsReview ? null : routing.teamId,
          routing_reason: routing.reason,
          needs_review: Boolean(needsReviewReason),
          needs_review_reason: needsReviewReason || null,
        },
      },
    });
    if (error) throw new Error(`ticket linking failed: ${error.message}`);
    attach = data as AttachResult;
    if (attach?.status !== "retry") break;
    // A related ticket appeared concurrently (or the match was not linkable): re-evaluate.
    candidates = await retrieveCandidates(db, candidateParams);
    const again = await safely(() => detectDuplicate(dedupeInput, candidates));
    duplicate = again.ok ? again.output : duplicate;
    decision = again.ok ? decideLink(again.output, thresholds) : decision;
  }
  if (!attach || attach.status === "retry") throw new Error("could not link report to a ticket");

  const { data: ticket } = await db
    .from("tickets")
    .select("id, ticket_number, status, category, priority, safety_level, title")
    .eq("id", attach.ticket_id)
    .single();
  const { count } = await db.from("reports").select("id", { count: "exact", head: true }).eq("ticket_id", attach.ticket_id);

  // Persist the full, validated AI analysis on the report for transparency.
  const mode = aiConfig().mode;
  const analysis = {
    mode,
    model: mode === "live" ? aiConfig().model : null,
    classification,
    safety: { ...safety, ai: aiSafety, rules },
    duplicate: { assessment: duplicate, decision: decision.decision, candidates: candidates.map((c) => c.ticket_number), thresholds },
    triage,
    routing,
    degraded: degradedReasons,
    processed_at: new Date().toISOString(),
  };
  await db
    .from("reports")
    .update({ ai_analysis: analysis, processing_status: "processed", processing_error: degradedReasons.join("; ") || null })
    .eq("id", p.reportId);

  const runs: [string, Agent<unknown>, unknown][] = [
    ["classification", cls, { has_image: Boolean(p.image) }],
    ["safety", saf, { rules_level: rules.level }],
    ["duplicate_detection", dup, { candidates: candidates.length }],
    ["triage_routing", tri, { category }],
  ];
  await Promise.all(
    runs.map(([agent, r, inputSummary]) =>
      recordAiRun({
        agent,
        reportId: p.reportId,
        ticketId: attach!.ticket_id,
        mode,
        model: r.ok ? r.model : null,
        inputSummary,
        output: r.ok ? r.output : null,
        valid: r.ok,
        error: r.ok ? null : r.error,
        latencyMs: r.ok ? r.latencyMs : undefined,
      }),
    ),
  );

  // Emergency: bypass the queue immediately.
  if (attach.escalate || (ticket?.safety_level === "critical" && attach.status === "created")) {
    await triggerEmergency(attach.ticket_id);
  }

  return {
    ticketId: attach.ticket_id,
    ticketNumber: ticket?.ticket_number ?? attach.ticket_number ?? "",
    ticketStatus: ticket?.status ?? "submitted",
    category: ticket?.category ?? category,
    priority: (ticket?.priority ?? priority) as Priority,
    safetyLevel: ticket?.safety_level ?? safety.safety_level,
    title: ticket?.title ?? "",
    linkStatus: attach.status === "linked" ? "auto_linked" : decision.decision === "review" ? "pending_review" : "new_ticket",
    linkedReports: count ?? 1,
    routingReason: routing.reason,
    aiMode: mode,
    degraded: degradedReasons.length > 0,
    hazards: safety.detected_hazards,
    safetyAdvice: adviceFor(safety.detected_hazards),
  };
}

export type { AppSettings };

