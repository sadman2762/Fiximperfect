import { cn } from "@/lib/utils";

/** App icon: a squircle with a soft gradient and a wrench glyph. */
export function AppMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative grid place-items-center rounded-[28%] bg-gradient-to-br from-[#2997ff] via-[#0071e3] to-[#5e5ce6] text-white shadow-[0_4px_14px_-4px_rgba(0,113,227,0.55)]",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-[55%]" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
      <span className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-b from-white/25 to-transparent" />
    </span>
  );
}
