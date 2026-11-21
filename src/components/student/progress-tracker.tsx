import { Check } from "lucide-react";
import { PROGRESS_STEPS, TONE_COLORS, type Progress } from "@/lib/tickets/progress";
import { cn } from "@/lib/utils";

/** Parcel-tracking style stepper (same model as the status e-mails). */
export function ProgressTracker({ progress }: { progress: Progress }) {
  const c = TONE_COLORS[progress.tone];
  const last = PROGRESS_STEPS.length - 1;
  return (
    <ol className="flex w-full" aria-label={`Progress: step ${progress.step + 1} of ${PROGRESS_STEPS.length}, ${PROGRESS_STEPS[progress.step].label}`}>
      {PROGRESS_STEPS.map((s, i) => {
        const done = i < progress.step || (progress.tone === "done" && i === progress.step);
        const current = i === progress.step && progress.tone !== "done";
        return (
          <li key={s.key} className="relative flex flex-1 flex-col items-center" aria-current={current ? "step" : undefined}>
            {/* connector halves */}
            {i > 0 ? (
              <span
                aria-hidden
                className="absolute top-[14px] right-1/2 left-0 h-[3px] -translate-y-1/2"
                style={i - 1 < progress.step ? { background: c.accent } : { backgroundImage: "linear-gradient(90deg,#c7c7cc 55%,transparent 0)", backgroundSize: "8px 3px" }}
              />
            ) : null}
            {i < last ? (
              <span
                aria-hidden
                className="absolute top-[14px] right-0 left-1/2 h-[3px] -translate-y-1/2"
                style={i < progress.step ? { background: c.accent } : { backgroundImage: "linear-gradient(90deg,#c7c7cc 55%,transparent 0)", backgroundSize: "8px 3px" }}
              />
            ) : null}
            <span className="relative grid h-7 place-items-center">
              {done ? (
                <span className="grid size-7 place-items-center rounded-full text-white" style={{ background: c.accent }}>
                  <Check className="size-4" strokeWidth={3} aria-hidden />
                </span>
              ) : current ? (
                <span className="pop grid size-8 place-items-center rounded-full border-[3px] bg-white" style={{ borderColor: c.accent }}>
                  <span className="size-2.5 animate-pulse rounded-full motion-reduce:animate-none" style={{ background: c.accent }} />
                </span>
              ) : (
                <span className="size-3.5 rounded-full border-2 border-[#c7c7cc] bg-white" />
              )}
            </span>
            <span className={cn("mt-2 px-0.5 text-center text-[11px] leading-tight", current ? "font-bold" : "font-medium")} style={{ color: done || current ? c.ink : "#86868b" }}>
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
