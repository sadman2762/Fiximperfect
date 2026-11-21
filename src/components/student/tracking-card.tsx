import Link from "next/link";
import { Mail } from "lucide-react";
import { formatDate } from "@/components/shared/ui-bits";
import { ProgressTracker } from "@/components/student/progress-tracker";
import { progressFor, TONE_COLORS } from "@/lib/tickets/progress";
import { PriorityBadge } from "@/components/shared/badges";
import type { StudentView } from "@/lib/student/access";

function Row({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 px-4 py-3.5">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e6f4f0] text-[17px]" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-[#5f7183]">{label}</p>
        <div className="mt-0.5 text-[15px] font-medium text-[#183247]">{children}</div>
      </div>
    </div>
  );
}

export function TrackingCard({ view, emailsHref }: { view: StudentView; emailsHref?: string | null }) {
  const { report, ticket, location, timeline } = view;
  const progress = progressFor(ticket?.status, {
    verified: ticket?.resolution_verified,
    critical: ticket?.safety_level === "critical",
    linked: (ticket?.report_count ?? 1) > 1,
  });
  const c = TONE_COLORS[progress.tone];
  return (
    <article className="rise overflow-hidden surface">
      <div className="geo px-5 pt-6 pb-5" style={{ backgroundColor: c.band }}>
        <p className="text-center text-[13px] font-bold tracking-[0.06em] uppercase" style={{ color: c.ink }}>
          {progress.headline}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-center text-[13px] text-[#3b4d5e]">{progress.explanation}</p>
        <div className="mt-5">
          <ProgressTracker progress={progress} />
        </div>
      </div>

      <div className="px-5 pt-5">
        <p className="text-[12px] font-medium text-[#5f7183]">Your report</p>
        <blockquote className="mt-1 text-[17px] leading-snug font-medium text-[#183247]">“{report.description}”</blockquote>
      </div>

      <div className="m-4 divide-y divide-[#dde2e5] overflow-hidden rounded-2xl border border-[#dde2e5]">
        <Row icon="📋" label="Report number">
          <div className="flex flex-wrap justify-between gap-x-6 gap-y-1">
            <span className="font-mono text-[14px]">{report.report_number}</span>
            {ticket ? (
              <span className="text-[13px] font-normal text-[#3b4d5e]">
                Ticket <span className="font-mono font-semibold text-[#00866a]">{ticket.ticket_number}</span>
              </span>
            ) : null}
          </div>
        </Row>
        <Row icon="🔧" label={location.asset ? "Equipment" : "Category"}>
          {location.asset ? `${location.asset} · ` : ""}
          {ticket?.category ?? "Being classified"}
        </Row>
        <Row icon="📍" label={location.building}>
          Floor {location.floor} · {location.area}
        </Row>
        {ticket ? (
          <Row icon="👥" label="Reports on this issue">
            <span className="flex flex-wrap items-center gap-2">
              {ticket.report_count} {ticket.report_count === 1 ? "report" : "reports"} · <PriorityBadge priority={ticket.priority} />
            </span>
          </Row>
        ) : null}
      </div>

      <div className="px-5 pb-5">
        <h3 className="text-[15px] font-semibold">History</h3>
        <ol className="mt-3 space-y-3">
          {[...timeline].reverse().map((e, i) => (
            <li key={i} className="relative pl-6 text-sm after:absolute after:top-5 after:bottom-[-12px] after:left-[6.5px] after:w-px after:bg-[#dde2e5] last:after:hidden">
              <span aria-hidden className="absolute top-[6px] left-[2px] size-2.5 rounded-full" style={{ background: i === 0 ? c.accent : "#c9d1d6" }} />
              <p className={i === 0 ? "font-semibold text-[#183247]" : "text-[#3b4d5e]"}>{e.label}</p>
              <p className="text-xs text-[#5f7183]">{formatDate(e.at)}</p>
            </li>
          ))}
        </ol>
        {emailsHref ? (
          <Link href={emailsHref} className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-medium text-[#00866a] hover:text-[#006b55]">
            <Mail className="size-4" aria-hidden /> View the e-mails we sent you
          </Link>
        ) : null}
      </div>
    </article>
  );
}
