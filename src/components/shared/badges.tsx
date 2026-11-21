import { cn } from "@/lib/utils";
import { AlertTriangle, Bot, FlaskConical, ShieldAlert, ArrowDown, ArrowUp, Minus, Flame, CheckCircle2, Clock, CircleDot, RotateCcw, Wrench, Package, Lock, Eye } from "lucide-react";
import { STATUS_LABELS } from "@/lib/tickets/state-machine";
import type { Priority, SafetyLevel, TicketStatus } from "@/types/domain";

// Tinted capsules (no outlines), always icon + label so colour never carries meaning alone.
const pill = "inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[12px] font-medium whitespace-nowrap ring-0";

/** Priority uses the reserved status palette, always with icon + label (never colour alone). */
export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  const map = {
    critical: { cls: "bg-[#d03b3b] text-white ring-[#d03b3b]", Icon: Flame, label: "Critical" },
    high: { cls: "bg-[#ec835a]/15 text-[#9a3412] ring-[#ec835a]/50", Icon: ArrowUp, label: "High" },
    medium: { cls: "bg-[#fab219]/15 text-[#854d0e] ring-[#fab219]/60", Icon: Minus, label: "Medium" },
    low: { cls: "bg-slate-100 text-slate-700 ring-slate-300", Icon: ArrowDown, label: "Low" },
  }[priority];
  return (
    <span className={cn(pill, map.cls, className)}>
      <map.Icon className="size-3" aria-hidden />
      {map.label}
    </span>
  );
}

const STATUS_STYLE: Record<TicketStatus, { cls: string; Icon: typeof Clock }> = {
  submitted: { cls: "bg-slate-50 text-slate-700 ring-slate-300", Icon: CircleDot },
  needs_review: { cls: "bg-violet-50 text-violet-800 ring-violet-300", Icon: Eye },
  assigned: { cls: "bg-sky-50 text-sky-800 ring-sky-300", Icon: Clock },
  in_progress: { cls: "bg-blue-50 text-blue-800 ring-blue-300", Icon: Wrench },
  waiting_for_parts: { cls: "bg-amber-50 text-amber-800 ring-amber-300", Icon: Package },
  resolved: { cls: "bg-emerald-50 text-emerald-800 ring-emerald-300", Icon: CheckCircle2 },
  reopened: { cls: "bg-rose-50 text-rose-800 ring-rose-300", Icon: RotateCcw },
  closed: { cls: "bg-slate-100 text-slate-600 ring-slate-300", Icon: Lock },
};

export function StatusBadge({ status, className }: { status: TicketStatus; className?: string }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={cn(pill, s.cls, className)}>
      <s.Icon className="size-3" aria-hidden />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function SafetyBadge({ level, className }: { level: SafetyLevel; className?: string }) {
  if (level === "none") return null;
  const map = {
    critical: { cls: "bg-[#d03b3b] text-white ring-[#d03b3b]", Icon: ShieldAlert, label: "Safety: critical" },
    elevated: { cls: "bg-[#ec835a]/15 text-[#9a3412] ring-[#ec835a]/50", Icon: AlertTriangle, label: "Safety: elevated" },
    low: { cls: "bg-amber-50 text-amber-800 ring-amber-300", Icon: AlertTriangle, label: "Safety: low" },
  }[level];
  return (
    <span className={cn(pill, map.cls, className)}>
      <map.Icon className="size-3" aria-hidden />
      {map.label}
    </span>
  );
}

/** Makes the origin of an AI decision explicit — mock fixtures are never shown as live AI. */
export function AiModeBadge({ mode, className }: { mode: string | null | undefined; className?: string }) {
  if (mode === "live") {
    return (
      <span className={cn(pill, "bg-teal-50 text-teal-800 ring-teal-300", className)} title="Decision produced by a live Claude API call">
        <Bot className="size-3" aria-hidden /> Live AI
      </span>
    );
  }
  if (mode === "manual") return <span className={cn(pill, "bg-slate-50 text-slate-700 ring-slate-300", className)}>Manual</span>;
  return (
    <span className={cn(pill, "bg-orange-50 text-orange-800 ring-orange-300", className)} title="Deterministic demo fixture — not a live AI decision">
      <FlaskConical className="size-3" aria-hidden /> Mock AI fixture
    </span>
  );
}

export function DeliveryBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    simulated: "bg-orange-50 text-orange-800 ring-orange-300",
    sent: "bg-sky-50 text-sky-800 ring-sky-300",
    queued: "bg-slate-50 text-slate-700 ring-slate-300",
    delivered: "bg-emerald-50 text-emerald-800 ring-emerald-300",
    failed: "bg-rose-50 text-rose-800 ring-rose-300",
  };
  const label: Record<string, string> = {
    simulated: "Simulated (no provider)",
    sent: "Accepted by provider",
    queued: "Queued at provider",
    delivered: "Delivered (provider confirmed)",
    failed: "Failed",
  };
  return <span className={cn(pill, map[status] ?? map.queued)}>{label[status] ?? status}</span>;
}
