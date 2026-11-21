import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Inbox } from "lucide-react";
import { StudentShell } from "@/components/student/student-shell";
import { studentViewByToken } from "@/lib/student/access";
import { adminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { formatDate } from "@/components/shared/ui-bits";

export const metadata: Metadata = { title: "Your e-mails", referrer: "no-referrer", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Demo-mode inbox: shows the e-mails Fiximperfect generated for THIS report
 * when no e-mail provider is configured (so they were only simulated).
 * Access requires the student's own tracking token. Disabled outside demo mode.
 */
export default async function StudentEmailsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await studentViewByToken(token);
  const enabled = env().DEMO_TOOLS_ENABLED === "true";
  const { data: emails } =
    view && enabled
      ? await adminClient()
          .from("notifications")
          .select("id, subject, body_html, delivery_status, created_at, recipient")
          .eq("report_id", view.report.id)
          .eq("audience", "student")
          .eq("channel", "email")
          .order("created_at", { ascending: false })
      : { data: null };

  return (
    <StudentShell>
      <Link href={`/track/${token}`} className="inline-flex items-center gap-1 text-[14px] text-[#0071e3] hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> Back to tracking
      </Link>
      {!view || !enabled ? (
        <div className="rounded-xl bg-card p-5 surface">
          <h1 className="font-semibold">Not available</h1>
          <p className="mt-1 text-sm text-muted-foreground">E-mails are delivered to your inbox.</p>
        </div>
      ) : (
        <>
          <div className="rise text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-xl bg-gradient-to-br from-[#2997ff] to-[#0071e3] text-white">
              <Inbox className="size-7" aria-hidden />
            </span>
            <h1 className="mt-4 text-[26px] font-bold tracking-[-0.03em]">Your e-mails</h1>
            <p className="mx-auto mt-1 max-w-sm text-[14px] text-muted-foreground">
              Demo mode: no e-mail provider is connected, so these messages were recorded instead of sent. This is exactly what lands in the inbox.
            </p>
          </div>
          {(emails ?? []).map((m, i) => (
            <details key={m.id} open={i === 0} className="rise overflow-hidden rounded-xl bg-card surface">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#0b1f3a] text-[13px] font-bold text-[#ffd60a]">F.</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{m.subject}</span>
                  <span className="block text-xs text-muted-foreground">
                    to {m.recipient} · {formatDate(m.created_at)} · {m.delivery_status === "simulated" ? "simulated" : m.delivery_status}
                  </span>
                </span>
              </summary>
              {m.body_html && m.delivery_status === "simulated" ? (
                <iframe
                  title={m.subject ?? "E-mail"}
                  srcDoc={m.body_html}
                  sandbox="allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
                  className="h-[860px] w-full border-t border-[#e1e5eb] bg-[#f7f9fc]"
                />
              ) : (
                <p className="border-t border-[#e1e5eb] px-4 py-3 text-sm text-muted-foreground">This e-mail was delivered to your inbox.</p>
              )}
            </details>
          ))}
          {!emails?.length ? <p className="text-center text-sm text-muted-foreground">No e-mails yet.</p> : null}
        </>
      )}
    </StudentShell>
  );
}
