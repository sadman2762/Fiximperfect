import type { Metadata } from "next";
import { StudentShell } from "@/components/student/student-shell";
import { HistoryRequestForm } from "@/components/student/history-request-form";

export const metadata: Metadata = { title: "My reports" };

export default function TrackIndexPage() {
  return (
    <StudentShell>
      <div className="rounded-2xl bg-card p-5 surface">
        <h1 className="font-semibold">My maintenance reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter the email address you used when reporting. We will email you a private link listing your reports — no account needed.
        </p>
        <HistoryRequestForm />
      </div>
    </StudentShell>
  );
}
