import type { TicketStatus } from "@/types/domain";

/**
 * Student-facing progress model (parcel-tracking style). Shared by the
 * tracking page and every status email so both always tell the same story.
 */
export const PROGRESS_STEPS = [
  { key: "received", label: "Received" },
  { key: "assigned", label: "Assigned" },
  { key: "repair", label: "Being repaired" },
  { key: "fixed", label: "Fixed" },
  { key: "confirmed", label: "Confirmed" },
] as const;

export type ProgressTone = "info" | "progress" | "success" | "warning" | "critical" | "done";

export interface Progress {
  /** Index of the current step in PROGRESS_STEPS (0-based). */
  step: number;
  headline: string;
  explanation: string;
  tone: ProgressTone;
}

export function progressFor(status: TicketStatus | null | undefined, opts: { verified?: boolean; critical?: boolean; linked?: boolean } = {}): Progress {
  switch (status) {
    case "assigned":
      return { step: 1, tone: opts.critical ? "critical" : "info", headline: opts.critical ? "Safety team alerted" : "Your report has been assigned", explanation: opts.critical ? "This was flagged as a safety hazard. Staff were alerted immediately — please keep away from the area." : "A maintenance team is now responsible for the repair." };
    case "in_progress":
      return { step: 2, tone: "progress", headline: "Repair in progress", explanation: "A technician is working on the problem." };
    case "waiting_for_parts":
      return { step: 2, tone: "warning", headline: "Waiting for parts", explanation: "The repair is paused until the replacement parts arrive." };
    case "reopened":
      return { step: 2, tone: "warning", headline: "Back in repair", explanation: "Someone reported that the problem is not fixed yet, so the ticket was reopened." };
    case "resolved":
      return opts.verified
        ? { step: 4, tone: "done", headline: "Fix confirmed", explanation: "Everyone who reported this confirmed it is fixed." }
        : { step: 3, tone: "success", headline: "Marked as fixed — is it?", explanation: "Please let us know whether the problem is really fixed." };
    case "closed":
      return { step: 4, tone: "done", headline: "All done", explanation: "This ticket is closed. Thanks for helping keep the building in shape." };
    case "needs_review":
      return { step: 0, tone: "info", headline: "We received your report", explanation: "A caretaker is reviewing it before it is assigned." };
    default:
      return {
        step: 0,
        tone: opts.critical ? "critical" : "info",
        headline: "We received your report",
        explanation: opts.linked ? "Others reported this too — your report joined the existing ticket." : "Your report is in the queue.",
      };
  }
}

/** Status colour of each progress step (brand palette). */
export const STEP_COLORS: Record<(typeof PROGRESS_STEPS)[number]["key"], string> = {
  received: "#64748b",
  assigned: "#0071e3",
  repair: "#d97706",
  fixed: "#16a34a",
  confirmed: "#0b1f3a",
};

/** Band / ink / accent per tone — shared by the e-mails and the tracking page. */
export const TONE_COLORS: Record<ProgressTone, { band: string; ink: string; accent: string }> = {
  info: { band: "#e8f2ff", ink: "#0b1f3a", accent: "#0071e3" },
  progress: { band: "#fff7ed", ink: "#0b1f3a", accent: "#d97706" },
  warning: { band: "#fff7ed", ink: "#0b1f3a", accent: "#d97706" },
  success: { band: "#f0fdf4", ink: "#0b1f3a", accent: "#16a34a" },
  done: { band: "#e8f2ff", ink: "#0b1f3a", accent: "#0b1f3a" },
  critical: { band: "#fef2f2", ink: "#7f1d1d", accent: "#dc2626" },
};
