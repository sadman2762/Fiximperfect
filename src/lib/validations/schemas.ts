import { z } from "zod";
import { PRIORITIES, TICKET_STATUSES } from "@/types/domain";

const money = z
  .string()
  .trim()
  .regex(/^\d{1,9}(\.\d{1,2})?$/, "Use a positive amount with up to 2 decimals")
  .or(z.number().nonnegative().transform((n) => n.toFixed(2)));

export const ReportSubmissionSchema = z.object({
  qrSlug: z.string().regex(/^[a-z0-9-]{3,80}$/),
  selectedAssetId: z.string().uuid().optional().nullable(),
  description: z.string().trim().min(3, "Please describe the problem").max(2000),
  additionalDetails: z.string().trim().max(2000).optional().nullable(),
  reporterName: z.string().trim().min(1, "Please enter your name").max(120),
  reporterEmail: z.string().trim().email("Please enter a valid email address").max(254),
});

export const StatusUpdateSchema = z.object({
  status: z.enum(TICKET_STATUSES),
  note: z.string().trim().max(2000).optional().nullable(),
  expectedStatus: z.enum(TICKET_STATUSES).optional(),
});

export const AssignmentSchema = z
  .object({
    teamId: z.string().uuid().nullable().optional(),
    assigneeId: z.string().uuid().nullable().optional(),
    note: z.string().trim().max(2000).optional().nullable(),
  })
  .refine((v) => v.teamId !== undefined || v.assigneeId !== undefined, "Choose a team or a person");

export const PrioritySchema = z.object({
  priority: z.enum(PRIORITIES),
  reason: z.string().trim().min(3, "Explain why the priority is changing").max(1000),
});

export const NoteSchema = z.object({ note: z.string().trim().min(1).max(4000) });

export const CostSchema = z.object({
  partsCost: money.default("0"),
  labourCost: money.default("0"),
  otherCost: money.default("0"),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("EUR"),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const MergeSchema = z.object({ targetTicketId: z.string().uuid() });

export const FeedbackSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
  response: z.enum(["fixed", "still_broken"]),
  comment: z.string().trim().max(2000).optional().nullable(),
});

/** Exact decimal sum of money strings (cents arithmetic, no floating point). */
export function sumMoney(...amounts: string[]): string {
  let cents = BigInt(0);
  for (const a of amounts) {
    const [whole, frac = ""] = a.split(".");
    cents += BigInt(whole) * BigInt(100) + BigInt((frac + "00").slice(0, 2));
  }
  const s = cents.toString().padStart(3, "0");
  return `${s.slice(0, -2)}.${s.slice(-2)}`;
}
