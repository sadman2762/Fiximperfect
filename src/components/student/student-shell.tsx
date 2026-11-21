import Link from "next/link";
import { AppMark, Wordmark } from "@/components/shared/app-mark";

/** Student pages: navy navbar (matches the e-mail header), light content area. */
export function StudentShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="navy sticky top-0 z-30">
        <div className="mx-auto flex h-14 max-w-lg items-center gap-2 px-5">
          <Link href="/" className="flex items-center gap-2">
            <AppMark className="size-7 ring-white/20" />
            <Wordmark onDark className="text-[17px]" />
          </Link>
          <Link href="/track" className="ml-auto rounded-lg px-2.5 py-1.5 text-[13px] text-white/80 hover:bg-white/10 hover:text-white">
            My reports
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-lg space-y-5 px-5 pt-6 pb-16">{children}</main>
    </div>
  );
}
