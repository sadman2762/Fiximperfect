import Link from "next/link";
import type { Metadata } from "next";
import { StudentShell } from "@/components/student/student-shell";
import { TrackingCard } from "@/components/student/tracking-card";
import { studentViewByToken } from "@/lib/student/access";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Track your report", referrer: "no-referrer", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function TrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await studentViewByToken(token);
  return (
    <StudentShell>
      {view ? (
        <TrackingCard view={view} emailsHref={env().DEMO_TOOLS_ENABLED === "true" ? `/track/${token}/emails` : null} />
      ) : (
        <div className="rounded-xl bg-card p-5 surface">
          <h1 className="font-semibold">Link not valid</h1>
          <p className="mt-1 text-sm text-muted-foreground">This tracking link is invalid or has expired.</p>
        </div>
      )}
      <p className="text-center text-sm">
        <Link href="/track" className="text-[#0071e3] underline-offset-4 hover:underline">
          See all my reports
        </Link>
      </p>
    </StudentShell>
  );
}
