import * as React from "react";
import { cn } from "@/lib/utils";

/** Native <select> styled to match the input components (robust in forms, accessible). */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-10 w-full min-w-0 appearance-none rounded-xl border border-[#dde2e5] bg-white bg-[url(\"data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%235f6672%27 stroke-width=%272.5%27 stroke-linecap=%27round%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E\")] bg-[length:12px] bg-[right_12px_center] bg-no-repeat pr-8 pl-3.5 text-sm outline-none transition-colors focus-visible:border-[#00866a] focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-[#00866a]/15 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function StatTile({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "critical" | "warning" | "default" }) {
  return (
    <div className="rise relative overflow-hidden px-5 py-4 surface">
      <p className="label-caps truncate" title={label}>{label}</p>
      {tone === "critical" ? <span aria-hidden className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-[#dc2626]" /> : null}
      <p
        className={cn(
          "mt-2 text-[clamp(1.375rem,1.9vw,1.75rem)] leading-none font-semibold tracking-[-0.03em] whitespace-nowrap text-[#183247] tabular-nums",
          tone === "critical" && "text-[#dc2626]",
          tone === "warning" && "text-[#b45309]",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-2 text-xs leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="px-6 py-12 text-center surface">
      <p className="text-[15px] font-semibold">{title}</p>
      {children ? <div className="mt-1 text-sm text-muted-foreground">{children}</div> : null}
    </div>
  );
}

/** iOS-style large title header. */
export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="rise mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="title-lg">{title}</h1>
        {description ? <div className="mt-2 text-[15px] text-muted-foreground">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function formatDate(iso: string | null | undefined, withTime = true) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(new Date(iso));
}

export function formatHours(h: number | null | undefined) {
  if (h === null || h === undefined) return "—";
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} days`;
}
