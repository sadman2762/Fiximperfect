import "server-only";
import { renderStatusEmail, type InfoRow } from "@/lib/notifications/email-layout";
import { progressFor } from "@/lib/tickets/progress";
import type { TicketStatus } from "@/types/domain";

/** Plain, accessible message templates. All dynamic values are escaped for HTML. */
const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

function layout(title: string, paragraphs: string[], cta?: { label: string; url: string }[]) {
  const buttons = (cta ?? [])
    .map(
      (c) =>
        `<a href="${esc(c.url)}" style="display:inline-block;margin:8px 8px 0 0;padding:10px 16px;border-radius:8px;background:#0f766e;color:#fff;text-decoration:none;font-weight:600">${esc(c.label)}</a>`,
    )
    .join("");
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#0f172a;max-width:560px;margin:auto;padding:24px">
<p style="font-weight:700;color:#0f766e;margin:0 0 16px">Fiximperfect</p>
<h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>
${paragraphs.map((p) => `<p style="line-height:1.5">${esc(p)}</p>`).join("")}
${buttons}
<p style="color:#68798a;font-size:12px;margin-top:24px">This is an automated message from your dormitory maintenance service. Links are personal — please do not forward them.</p>
</body></html>`;
}

export const STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  needs_review: "Under review",
  assigned: "Assigned to a maintenance team",
  in_progress: "Repair in progress",
  waiting_for_parts: "Waiting for parts",
  resolved: "Marked as resolved",
  reopened: "Reopened",
  closed: "Closed",
};

/** Everything a student e-mail needs to describe "their" report. */
export interface StudentEmailContext {
  name: string;
  reportNumber: string;
  ticketNumber: string;
  building: string;
  floor: number;
  area: string;
  asset: string | null;
  category: string;
  status: TicketStatus;
  verified?: boolean;
  critical?: boolean;
  linkedReports?: number;
  trackingUrl: string;
  safetyAdvice?: string | null;
}

const FOOTER =
  "You are receiving this because you reported a maintenance problem. The links in this e-mail are personal — please do not forward them. If anyone is in immediate danger, call your local emergency number.";

function baseRows(c: StudentEmailContext, statusText: string): InfoRow[] {
  return [
    { icon: "ℹ️", label: "Status", value: statusText },
    { icon: "📋", label: "Your report", value: c.reportNumber, second: { label: "Ticket number", value: c.ticketNumber, href: c.trackingUrl } },
    { icon: "🔧", label: c.asset ? "Equipment" : "Category", value: c.asset ? `${c.asset} · ${c.category}` : c.category },
    { icon: "📍", label: c.building, value: `Floor ${c.floor} · ${c.area}` },
  ];
}

function plainText(lines: string[], links: [string, string][]) {
  return `${lines.filter(Boolean).join("\n\n")}\n\n${links.map(([l, u]) => `${l}: ${u}`).join("\n")}`;
}

export function reportReceived(c: StudentEmailContext) {
  const progress = progressFor(c.status, { critical: c.critical, linked: (c.linkedReports ?? 1) > 1 });
  const subject = `We received your report ${c.reportNumber}`;
  const intro =
    (c.linkedReports ?? 1) > 1
      ? `Thank you for reporting a problem with ${c.asset ?? c.area}. Others reported the same issue, so your report joined ticket ${c.ticketNumber} (${c.linkedReports} reports). You will still receive your own updates.`
      : `Thank you for reporting a problem with ${c.asset ?? c.area}. Your report ${c.reportNumber} is now maintenance ticket ${c.ticketNumber}.`;
  const notes = [
    c.critical ? "⚠️ This was flagged as a safety hazard and staff have been alerted. Please keep away from the area." : "",
    c.safetyAdvice ? `What to do now: ${c.safetyAdvice}` : "",
    "You can follow the progress at any time with your personal tracking link. We will also e-mail you whenever the status changes.",
  ].filter(Boolean);
  return {
    subject,
    text: plainText([`Dear ${c.name}!`, intro, `Status: ${progress.headline}`, ...notes], [["Track your report", c.trackingUrl]]),
    html: renderStatusEmail({
      preheader: `${progress.headline} — ticket ${c.ticketNumber}`,
      progress,
      greetingName: c.name,
      intro,
      rows: baseRows(c, `${progress.headline}. ${progress.explanation}`),
      buttons: [{ label: "Track my report", url: c.trackingUrl }],
      notes,
      footer: FOOTER,
    }),
  };
}

export function statusUpdate(c: StudentEmailContext & { note?: string | null }) {
  const progress = progressFor(c.status, { verified: c.verified, critical: c.critical });
  const subject = `${c.ticketNumber}: ${progress.headline}`;
  const intro = `We would like to let you know that the status of the problem you reported with ${c.asset ?? c.area} has changed.`;
  const notes = [c.note ? `Note from the maintenance team: ${c.note}` : ""].filter(Boolean);
  return {
    subject,
    text: plainText([`Dear ${c.name}!`, intro, `New status: ${progress.headline}. ${progress.explanation}`, ...notes], [["Track your report", c.trackingUrl]]),
    html: renderStatusEmail({
      preheader: `${progress.headline} — ticket ${c.ticketNumber}`,
      progress,
      greetingName: c.name,
      intro,
      rows: baseRows(c, `${progress.headline}. ${progress.explanation}`),
      buttons: [{ label: "Track my report", url: c.trackingUrl }],
      notes,
      footer: FOOTER,
    }),
  };
}

export function resolutionRequest(c: StudentEmailContext & { fixedUrl: string; brokenUrl: string }) {
  const progress = progressFor("resolved", { verified: false });
  const subject = `Is it fixed? ${c.ticketNumber}`;
  const intro = `Your reported ${(c.asset ?? c.area).toLowerCase()} problem has been marked as resolved. Is the problem actually fixed? Your answer makes sure repairs really work — if it is still broken, the ticket reopens automatically.`;
  return {
    subject,
    text: plainText([`Dear ${c.name}!`, intro], [
      ["Yes, fixed", c.fixedUrl],
      ["No, still broken", c.brokenUrl],
      ["Track your report", c.trackingUrl],
    ]),
    html: renderStatusEmail({
      preheader: `Please confirm the repair — ticket ${c.ticketNumber}`,
      progress,
      greetingName: c.name,
      intro,
      rows: baseRows(c, "Marked as resolved by the maintenance team. Waiting for your confirmation."),
      buttons: [
        { label: "Yes, fixed", url: c.fixedUrl },
        { label: "No, still broken", url: c.brokenUrl, style: "secondary" },
      ],
      notes: ["Each reporter answers separately; your answer is only linked to your own report."],
      footer: FOOTER,
    }),
  };
}

export function staffTicketAlert(p: { kind: string; ticketNumber: string; title: string; location: string; detail: string; url: string }) {
  const subject = `[${p.kind}] ${p.ticketNumber} — ${p.title}`;
  const lines = [`${p.kind}: ${p.title}`, `Location: ${p.location}`, p.detail];
  return { subject, text: `${lines.join("\n")}\n\nOpen: ${p.url}`, html: layout(subject, lines, [{ label: "Open ticket", url: p.url }]) };
}

export function emergencyAlert(p: { ticketNumber: string; hazards: string; location: string; ackUrl: string; attempt: number }) {
  const subject = `URGENT SAFETY ALERT ${p.ticketNumber}${p.attempt > 1 ? ` (escalation ${p.attempt})` : ""}`;
  const text = `URGENT: possible safety hazard reported. ${p.hazards}. Location: ${p.location}. Ticket ${p.ticketNumber}. Acknowledge: ${p.ackUrl}`;
  const voiceText = `This is an urgent Fiximperfect safety alert. ${p.hazards} reported at ${p.location}. Ticket ${p.ticketNumber.split("").join(" ")}.`;
  return {
    subject,
    text,
    voiceText,
    html: layout(subject, [`Possible hazard: ${p.hazards}`, `Location: ${p.location}`, "Please acknowledge immediately so the alert is not escalated to the next contact."], [
      { label: "Acknowledge alert", url: p.ackUrl },
    ]),
  };
}

export function historyLink(p: { url: string }) {
  const subject = "Your Fiximperfect maintenance reports";
  const lines = ["Use the link below to see the maintenance reports submitted with this email address. The link expires in 24 hours."];
  return { subject, text: `${lines.join("\n")}\n\n${p.url}`, html: layout(subject, lines, [{ label: "View my reports", url: p.url }]) };
}
