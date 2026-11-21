import { cn } from "@/lib/utils";

/** App icon: flat University Green tile with a wrench and the teal brand dot. */
export function AppMark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("relative grid place-items-center rounded-[28%] bg-[#00866a] text-white", className)}>
      <svg viewBox="0 0 24 24" className="size-[52%]" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
      <span className="absolute right-[14%] bottom-[14%] size-[18%] rounded-full bg-[#a6f0de]" />
    </span>
  );
}

/** "Fiximperfect." wordmark — navy on white, white on green; the dot is always the brand teal. */
export function Wordmark({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <span className={cn("font-bold tracking-[-0.02em]", onDark ? "text-white" : "text-[#183247]", className)}>
      Fiximperfect<span className={onDark ? "text-[#a6f0de]" : "text-[#08ba97]"}>.</span>
    </span>
  );
}
