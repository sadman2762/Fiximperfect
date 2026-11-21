import { cn } from "@/lib/utils";
import { AlertTriangle, Bot, FlaskConical, ShieldAlert, ArrowDown, ArrowUp, Minus, Flame, CheckCircle2, Clock, CircleDot, RotateCcw, Wrench, Package, BadgeCheck, Eye } from "lucide-react";
import { STATUS_LABELS } from "@/lib/tickets/state-machine";
import type { Priority, SafetyLevel, TicketStatus } from "@/types/domain";

// Soft tinted pills. Always icon + label, so colour never carries meaning alone.
const pill = "inline-flex items-center gap-1 rounded-full border px-2.5 py-[3px] text-[12px] font-medium whitespace-nowrap";

const TONE = {
  slate: "border-[#e2e8f0] bg-[#f1f5f9] text-[#475569]", // Received  #64748B
  blue: "border-[#cfe3fb] bg-[#e8f2ff] text-[#005bb5]", // Assigned  #0071E3
  amber: "border-[#fde3b6] bg-[#fff7ed] text-[#b45309]", // Being repaired #D97706
  green: "border-[#c7ecd4] bg-[#f0fdf4] text-[#15803d]", // Fixed #16A34A
  navy: "border-[#0b1f3a] bg-[#0b1f3a] text-white", // Confirmed #0B1F3A
  indigo: "border-[#dfe3fd] bg-[#eef2ff] text-[#4338ca]",
  red: "border-[#fbd5d5] bg-[#fef2f2] text-[#b91c1c]",
  solidRed: "border-[#dc2626] bg-[#dc2626] text-white",
  orange: "border-[#fed7aa] bg-[#fff7ed] text-[#c2410c]",
  grey: "border-[#e1e5eb] bg-white text-[#454b55]",
};

/** Priority uses the reserved status palette, always with icon + label. */
export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  const map = {
    critical: { cls: TONE.solidRed, Icon: Flame, label: "Critical" },
    high: { cls: TONE.orange, Icon: ArrowUp, label: "High" },
    medium: { cls: TONE.amber, Icon: Minus, label: "Medium" },
    low: { cls: TONE.grey, Icon: ArrowDown, label: "Low" },
  }[priority];
  return (
    <span className={cn(pill, map.cls, className)}>
      <map.Icon className="size-3" aria-hidden />
      {map.label}
    </span>
  );
}

const STATUS_STYLE: Record<TicketStatus, { cls: string; Icon: typeof Clock }> = {
  submitted: { cls: TONE.slate, Icon: CircleDot },
  needs_review: { cls: TONE.indigo, Icon: Eye },
  assigned: { cls: TONE.blue, Icon: Clock },
  in_progress: { cls: TONE.amber, Icon: Wrench },
  waiting_for_parts: { cls: TONE.amber, Icon: Package },
  resolved: { cls: TONE.green, Icon: CheckCircle2 },
  reopened: { cls: TONE.red, Icon: RotateCcw },
  closed: { cls: TONE.navy, Icon: BadgeCheck },
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
    critical: { cls: cn(TONE.solidRed, "pulse-critical"), Icon: ShieldAlert, label: "Safety: critical" },
    elevated: { cls: TONE.orange, Icon: AlertTriangle, label: "Safety: elevated" },
    low: { cls: TONE.amber, Icon: AlertTriangle, label: "Safety: low" },
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
      <span className={cn(pill, TONE.blue, className)} title="Decision produced by a live Claude API call">
        <Bot className="size-3" aria-hidden /> Live AI
      </span>
    );
  }
  if (mode === "manual") return <span className={cn(pill, TONE.grey, className)}>Manual</span>;
  return (
    <span className={cn(pill, TONE.orange, className)} title="Deterministic demo fixture — not a live AI decision">
      <FlaskConical className="size-3" aria-hidden /> Mock AI fixture
    </span>
  );
}

export function DeliveryBadge({ status }: { status: string }) {
  const map: Record<string, string> = { simulated: TONE.orange, sent: TONE.blue, queued: TONE.slate, delivered: TONE.green, failed: TONE.red };
  const label: Record<string, string> = {
    simulated: "Simulated (no provider)",
    sent: "Accepted by provider",
    queued: "Queued at provider",
    delivered: "Delivered (provider confirmed)",
    failed: "Failed",
  };
  return <span className={cn(pill, map[status] ?? TONE.grey)}>{label[status] ?? status}</span>;
}
