import Link from "next/link";
import { Siren } from "lucide-react";
import { AppMark, Wordmark } from "@/components/shared/app-mark";

/**
 * Student pages: navy navbar (matches the e-mail header) with an always-visible
 * red Emergency button. `emergencyAt` pre-selects the location (QR slug).
 */
export function StudentShell({ children, emergencyAt, hideEmergency = false }: { children: React.ReactNode; emergencyAt?: string; hideEmergency?: boolean }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="navy sticky top-0 z-30">
        <div className="mx-auto flex h-14 max-w-lg items-center gap-2 px-5">
          <Link href="/" className="flex items-center gap-2">
            <AppMark className="size-7 ring-white/20" />
            <Wordmark onDark className="text-[17px]" />
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <Link href="/track" className="rounded-lg px-2.5 py-1.5 text-[13px] text-white/80 hover:bg-white/10 hover:text-white">
              My reports
            </Link>
            {!hideEmergency ? (
              <Link
                href={emergencyAt ? `/emergency?at=${encodeURIComponent(emergencyAt)}` : "/emergency"}
                className="flex items-center gap-1.5 rounded-lg bg-[#dc2626] px-3 py-1.5 text-[13px] font-semibold text-white shadow-[0_4px_12px_-4px_rgba(220,38,38,0.8)] hover:bg-[#b91c1c] focus-visible:ring-4 focus-visible:ring-white/40 focus-visible:outline-none"
              >
                <Siren className="size-4" aria-hidden /> Emergency
              </Link>
            ) : null}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-lg space-y-5 px-5 pt-6 pb-16">{children}</main>
    </div>
  );
}
