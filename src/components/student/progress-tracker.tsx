import { Check } from "lucide-react";
import { PROGRESS_STEPS, STEP_COLORS, TONE_COLORS, type Progress } from "@/lib/tickets/progress";
import { cn } from "@/lib/utils";

/** Parcel-tracking style stepper — each step in its own status colour (same as the e-mails). */
export function ProgressTracker({ progress }: { progress: Progress }) {
  const last = PROGRESS_STEPS.length - 1;
  const color = (i: number) => (progress.tone === "critical" ? TONE_COLORS.critical.accent : STEP_COLORS[PROGRESS_STEPS[i].key]);
  return (
    <ol className="flex w-full" aria-label={`Progress: step ${progress.step + 1} of ${PROGRESS_STEPS.length}, ${PROGRESS_STEPS[progress.step].label}`}>
      {PROGRESS_STEPS.map((s, i) => {
        const done = i < progress.step || (progress.tone === "done" && i === progress.step);
        const current = i === progress.step && progress.tone !== "done";
        const c = color(i);
        const dashed = { backgroundImage: "linear-gradient(90deg,#c7c7cc 55%,transparent 0)", backgroundSize: "8px 2px", backgroundRepeat: "repeat-x", backgroundPosition: "center" };
        return (
          <li key={s.key} className="relative flex flex-1 flex-col items-center" aria-current={current ? "step" : undefined}>
            {i > 0 ? <span aria-hidden className="absolute top-[15px] right-1/2 left-0 h-[3px] -translate-y-1/2" style={i <= progress.step ? { background: c } : dashed} /> : null}
            {i < last ? <span aria-hidden className="absolute top-[15px] right-0 left-1/2 h-[3px] -translate-y-1/2" style={i < progress.step ? { background: color(i + 1) } : dashed} /> : null}
            <span className="relative grid h-[30px] place-items-center">
              {done ? (
                <span className="grid size-7 place-items-center rounded-full text-white shadow-sm" style={{ background: c }}>
                  <Check className="size-4" strokeWidth={3} aria-hidden />
                </span>
              ) : current ? (
                <span className="pop grid size-[30px] place-items-center rounded-full border-[3px] bg-white" style={{ borderColor: c, boxShadow: `0 0 0 4px ${c}22` }}>
                  <span className="size-2.5 animate-pulse rounded-full motion-reduce:animate-none" style={{ background: c }} />
                </span>
              ) : (
                <span className="size-3.5 rounded-full border-2 border-[#c7c7cc] bg-white" />
              )}
            </span>
            <span className={cn("mt-2 px-0.5 text-center text-[11.5px] leading-tight", current ? "font-semibold text-[#0b1f3a]" : done ? "font-medium text-[#454b55]" : "text-[#8a929e]")}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
