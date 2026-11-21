import Link from "next/link";
import { AppMark } from "@/components/shared/app-mark";

export function StudentShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="glass sticky top-0 z-30 border-b border-black/[0.06]">
        <div className="mx-auto flex h-12 max-w-lg items-center gap-2 px-5">
          <Link href="/" className="flex items-center gap-2">
            <AppMark className="size-6" />
            <span className="text-[15px] font-semibold tracking-tight">Fiximperfect</span>
          </Link>
          <Link href="/track" className="ml-auto text-[13px] text-primary hover:underline">
            My reports
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-lg space-y-5 px-5 pt-6 pb-16">{children}</main>
    </div>
  );
}
