import type { Metadata } from "next";
import { StudentShell } from "@/components/student/student-shell";
import { FeedbackForm } from "@/components/student/feedback-form";
import { adminClient } from "@/lib/supabase/admin";
import { isWellFormedToken } from "@/lib/security/tokens";
import { findFeedbackByToken } from "@/lib/workflows/resolution";

export const metadata: Metadata = { title: "Is it fixed?", referrer: "no-referrer", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function FeedbackPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ answer?: string }> }) {
  const { token } = await params;
  const { answer } = await searchParams;
  const fb = isWellFormedToken(token) ? await findFeedbackByToken(adminClient(), token) : null;

  let body: React.ReactNode;
  if (!fb) body = <Message title="Link not valid" text="This feedback link is invalid." />;
  else if (fb.response) body = <Message title="Thanks — already answered" text={`You told us the problem was ${fb.response === "fixed" ? "fixed" : "still broken"}.`} />;
  else if (new Date(fb.expires_at) < new Date()) body = <Message title="Link expired" text="This feedback link has expired. If the problem is back, please submit a new report." />;
  else {
    const subject = fb.tickets.assets?.asset_name ?? fb.tickets.locations.area_name;
    body = (
      <div className="rounded-xl bg-card p-5 surface">
        <p className="text-xs text-muted-foreground">
          Ticket {fb.tickets.ticket_number} · your report {fb.reports.report_number}
        </p>
        <h1 className="mt-1 text-lg font-semibold">Your reported {subject.toLowerCase()} problem has been marked as resolved.</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {fb.tickets.buildings.name}, floor {fb.tickets.locations.floor}, {fb.tickets.locations.area_name}
        </p>
        <p className="mt-4 font-medium">Is the problem actually fixed?</p>
        <FeedbackForm token={token} initial={answer === "fixed" || answer === "still_broken" ? answer : null} />
      </div>
    );
  }
  return <StudentShell>{body}</StudentShell>;
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl bg-card p-5 surface">
      <h1 className="font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
