import "server-only";
import { PROGRESS_STEPS, STEP_COLORS, TONE_COLORS, type Progress } from "@/lib/tickets/progress";

/**
 * Parcel-tracking style transactional e-mail. Table layout + inline styles
 * only (works in Gmail, Outlook, Apple Mail); icons are emoji because many
 * clients strip SVG and block remote images.
 */

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c]!);
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export interface InfoRow {
  icon: string;
  label: string;
  value: string;
  href?: string;
  /** Optional second column on the same row (e.g. ticket number next to report number). */
  second?: { label: string; value: string; href?: string };
}

export interface EmailButton {
  label: string;
  url: string;
  style?: "primary" | "secondary" | "danger";
}

export interface StatusEmail {
  preheader: string;
  progress: Progress;
  greetingName: string;
  intro: string;
  rows: InfoRow[];
  buttons: EmailButton[];
  notes?: string[];
  footer: string;
}

function stepper(p: Progress): string {
  const c = TONE_COLORS[p.tone];
  const last = PROGRESS_STEPS.length - 1;
  // Segment k joins step k and k+1: solid once step k+1 is reached, dashed otherwise.
  const stepColor = (i: number) => (p.tone === "critical" ? c.accent : STEP_COLORS[PROGRESS_STEPS[i].key]);
  // Segment k joins step k and k+1: solid in the colour of the step it reaches, dashed grey otherwise.
  const seg = (k: number) => (k < 0 || k >= last ? "border-top:3px solid transparent" : k < p.step ? `border-top:3px solid ${stepColor(k + 1)}` : "border-top:3px dashed #c7c7cc");
  const cells = PROGRESS_STEPS.map((s, i) => {
    const done = i < p.step || (p.tone === "done" && i === p.step);
    const current = i === p.step && p.tone !== "done";
    const sc = stepColor(i);
    const dot = done
      ? `<div style="width:26px;height:26px;line-height:26px;border-radius:13px;background:${sc};color:#ffffff;font-size:14px;font-weight:700;text-align:center">&#10003;</div>`
      : current
        ? `<div style="width:30px;height:30px;line-height:24px;border-radius:15px;background:#ffffff;border:3px solid ${sc};box-sizing:border-box;text-align:center"><span style="display:inline-block;width:10px;height:10px;border-radius:5px;background:${sc};vertical-align:middle"></span></div>`
        : `<div style="width:14px;height:14px;border-radius:7px;background:#ffffff;border:2px solid #c7c7cc;box-sizing:border-box"></div>`;
    return `<td width="20%" align="center" valign="top" style="padding:0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="height:30px"><tr>
    <td width="50%" style="vertical-align:middle;font-size:0;line-height:0"><div style="${seg(i - 1)}"></div></td>
    <td style="vertical-align:middle;padding:0">${dot}</td>
    <td width="50%" style="vertical-align:middle;font-size:0;line-height:0"><div style="${seg(i)}"></div></td>
  </tr></table>
  <div style="font-family:${FONT};font-size:11px;line-height:14px;margin-top:6px;color:${done || current ? "#0b1f3a" : "#8a929e"};font-weight:${current ? 700 : 500}">${esc(s.label)}</div>
</td>`;
  });
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells.join("")}</tr></table>`;
}

function link(value: string, href?: string, color = "#0071e3") {
  return href ? `<a href="${esc(href)}" style="color:${color};text-decoration:none">${esc(value)}</a>` : esc(value);
}

function rowsHtml(rows: InfoRow[], accent: string) {
  return rows
    .map(
      (r, i) => `
<tr><td style="padding:14px 18px;${i > 0 ? "border-top:2px solid #ffffff;" : ""}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td width="48" valign="top"><div style="width:36px;height:36px;line-height:36px;border-radius:18px;border:2px solid ${accent};text-align:center;font-size:17px;background:#ffffff">${r.icon}</div></td>
    <td valign="top" style="font-family:${FONT}">
      <div style="font-size:12px;font-weight:700;color:#1d1d1f">${esc(r.label)}</div>
      <div style="font-size:15px;color:#1d1d1f;margin-top:3px">${link(r.value, r.href, accent)}</div>
    </td>
    ${
      r.second
        ? `<td valign="top" width="45%" style="font-family:${FONT}">
      <div style="font-size:12px;font-weight:700;color:#1d1d1f">${esc(r.second.label)}</div>
      <div style="font-size:15px;margin-top:3px;color:${accent}">${link(r.second.value, r.second.href, accent)}</div>
    </td>`
        : ""
    }
  </tr></table>
</td></tr>`,
    )
    .join("");
}

function button(b: EmailButton, accent: string) {
  const bg = b.style === "secondary" ? "#ffffff" : b.style === "danger" ? "#d70015" : accent;
  const fg = b.style === "secondary" ? accent : "#ffffff";
  const border = b.style === "secondary" ? `2px solid ${accent}` : `2px solid ${bg}`;
  return `<td style="padding:6px"><a href="${esc(b.url)}" style="display:inline-block;padding:13px 22px;border-radius:999px;background:${bg};border:${border};color:${fg};font-family:${FONT};font-size:15px;font-weight:600;text-decoration:none">${esc(b.label)}</a></td>`;
}

export function renderStatusEmail(e: StatusEmail): string {
  const c = TONE_COLORS[e.progress.tone];
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(e.progress.headline)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f7">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(e.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden">
  <tr><td align="center" style="background:#0b1f3a;padding:22px 20px">
    <span style="font-family:${FONT};font-size:28px;font-weight:800;letter-spacing:-0.5px;color:#ffffff">Fiximperfect</span><span style="font-family:${FONT};font-size:28px;font-weight:800;color:#ffd60a">.</span>
    <div style="font-family:${FONT};font-size:12px;color:#a1b3cc;margin-top:2px">Dormitory maintenance</div>
  </td></tr>
  <tr><td style="background:${c.band};padding:20px 18px 18px">
    <div style="font-family:${FONT};font-size:17px;font-weight:800;letter-spacing:0.4px;text-transform:uppercase;text-align:center;color:${c.ink};margin-bottom:16px">${esc(e.progress.headline)}</div>
    ${stepper(e.progress)}
  </td></tr>
  <tr><td style="padding:24px 24px 6px;font-family:${FONT};color:#1d1d1f">
    <div style="font-size:16px;font-weight:700">Dear ${esc(e.greetingName)}!</div>
    <div style="font-size:14px;line-height:21px;color:#424245;margin-top:8px">${esc(e.intro)}</div>
  </td></tr>
  <tr><td style="padding:14px 24px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.band};border-radius:14px">${rowsHtml(e.rows, c.accent)}</table>
  </td></tr>
  ${
    e.buttons.length
      ? `<tr><td align="center" style="padding:10px 18px 4px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${e.buttons.map((b) => button(b, c.accent)).join("")}</tr></table></td></tr>`
      : ""
  }
  ${
    e.notes?.length
      ? `<tr><td style="padding:14px 24px 0;font-family:${FONT};font-size:13px;line-height:20px;color:#424245">${e.notes.map((n) => `<p style="margin:0 0 8px">${esc(n)}</p>`).join("")}</td></tr>`
      : ""
  }
  <tr><td style="padding:18px 24px 26px;font-family:${FONT};font-size:12px;line-height:18px;color:#86868b">${esc(e.footer)}</td></tr>
</table>
<div style="font-family:${FONT};font-size:11px;color:#86868b;margin-top:14px">Fiximperfect · University dormitory maintenance</div>
</td></tr></table>
</body></html>`;
}
