import type { DuplicateAssessment } from "@/lib/agents/schemas";

export interface DuplicateThresholds {
  autoLink: number; // default 0.85
  review: number; // default 0.65
}

export type LinkDecision =
  | { decision: "link"; matchedTicketNumber: string; confidence: number; reason: string }
  | { decision: "review"; matchedTicketNumber: string; confidence: number; reason: string }
  | { decision: "new"; matchedTicketNumber: null; confidence: number; reason: string };

/**
 * Deterministic threshold policy applied to the duplicate agent's output.
 *   >= autoLink  -> link automatically
 *   >= review    -> new ticket flagged for caretaker review (never auto-merged)
 *   otherwise    -> new ticket
 */
export function decideLink(a: DuplicateAssessment, t: DuplicateThresholds): LinkDecision {
  if (a.matched_ticket && a.is_duplicate && a.confidence >= t.autoLink) {
    return { decision: "link", matchedTicketNumber: a.matched_ticket, confidence: a.confidence, reason: a.reason };
  }
  if (a.matched_ticket && a.confidence >= t.review) {
    return {
      decision: "review",
      matchedTicketNumber: a.matched_ticket,
      confidence: a.confidence,
      reason: `Possible duplicate of ${a.matched_ticket} (${Math.round(a.confidence * 100)}% confidence): ${a.reason}`,
    };
  }
  return { decision: "new", matchedTicketNumber: null, confidence: a.confidence, reason: a.reason };
}

