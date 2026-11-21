import Link from "next/link";
import { Siren } from "lucide-react";
import { AppMark, Wordmark } from "@/components/shared/app-mark";

/**
 * Student pages: white navbar with a green brand rule (matches the e-mail header) and an always-visible
 * red Emergency button. `emergencyAt` pre-selects the location (QR slug).
 */
export function StudentShell({ children, emergencyAt, hideEmergency = false }: { children: React.ReactNode; emergencyAt?: string; hideEmergency?: boolean }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="chrome sticky top-0 z-30 border-t-[3px] border-b border-t-[#00866a] border-b-[#dde2e5]">
        <div className="mx-auto flex h-14 max-w-lg items-center gap-2 px-5">
          <Link href="/" className="flex items-center gap-2">
            <AppMark className="size-7" />
            <Wordmark className="text-[17px]" />
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <Link href="/track" className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-[#3b4d5e] hover:bg-[#e6f4f0] hover:text-[#00866a]">
              My reports
            </Link>
            {!hideEmergency ? (
              <Link
                href={emergencyAt ? `/emergency?at=${encodeURIComponent(emergencyAt)}` : "/emergency"}
                className="flex items-center gap-1.5 rounded-lg bg-[#dc2626] px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-[#b91c1c] focus-visible:ring-4 focus-visible:ring-[#dc2626]/30 focus-visible:outline-none"
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
