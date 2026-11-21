import type { Metadata } from "next";
import { StudentShell } from "@/components/student/student-shell";
import { TrackingCard } from "@/components/student/tracking-card";
import { historyByToken } from "@/lib/student/access";

export const metadata: Metadata = { title: "My reports", referrer: "no-referrer", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function HistoryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const history = await historyByToken(token);
  return (
    <StudentShell>
      {history ? (
        <>
          <h1 className="font-semibold">Reports from {history.email}</h1>
          {history.reports.map((v) => (
            <TrackingCard key={v.report.id} view={v} />
          ))}
        </>
      ) : (
        <div className="rounded-xl bg-card p-5 surface">
          <h1 className="font-semibold">Link not valid</h1>
          <p className="mt-1 text-sm text-muted-foreground">This link is invalid or has expired. Request a new one from the “My reports” page.</p>
        </div>
      )}
    </StudentShell>
  );
}
