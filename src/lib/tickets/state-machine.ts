import type { TicketStatus } from "@/types/domain";

/** Mirrors public.is_valid_transition() in SQL (the database enforces it too). */
export const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  submitted: ["needs_review", "assigned", "in_progress", "closed"],
  needs_review: ["submitted", "assigned", "in_progress", "closed"],
  assigned: ["needs_review", "in_progress", "waiting_for_parts", "resolved"],
  in_progress: ["assigned", "waiting_for_parts", "resolved"],
  waiting_for_parts: ["in_progress", "resolved"],
  resolved: ["closed", "reopened"],
  reopened: ["assigned", "in_progress", "waiting_for_parts", "resolved", "needs_review"],
  closed: ["reopened"],
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export const ACTIVE_STATUSES: TicketStatus[] = ["submitted", "needs_review", "assigned", "in_progress", "waiting_for_parts", "reopened"];

/** Statuses only a caretaker/administrator may set (maintenance staff may not close or review). */
export const COORDINATOR_ONLY: TicketStatus[] = ["closed", "needs_review", "submitted"];

/** Student-facing statuses that trigger an update email. */
export const STUDENT_NOTIFY_STATUSES: TicketStatus[] = ["assigned", "in_progress", "waiting_for_parts", "reopened", "closed"];

export const STATUS_LABELS: Record<TicketStatus, string> = {
  submitted: "Submitted",
  needs_review: "Needs review",
  assigned: "Assigned",
  in_progress: "In progress",
  waiting_for_parts: "Waiting for parts",
  resolved: "Resolved",
  reopened: "Reopened",
  closed: "Closed",
};

