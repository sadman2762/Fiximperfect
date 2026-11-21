import "server-only";
import { Resend } from "resend";
import twilio from "twilio";
import { env, appUrl } from "@/lib/env";
import { adminClient } from "@/lib/supabase/admin";

export type Channel = "email" | "sms" | "voice";
export type Audience = "student" | "caretaker" | "management" | "team";

export interface OutgoingMessage {
  audience: Audience;
  channel: Channel;
  recipient: string;
  type: string;
  subject?: string;
  text: string;
  html?: string;
  /** Spoken text for voice calls (TwiML <Say>). */
  voiceText?: string;
  /** Secure links contained in the message; redacted in stored previews. */
  secureLinks?: string[];
  ticketId?: string | null;
  reportId?: string | null;
  /** Optional URL Twilio should POST a keypress to (voice acknowledgement). */
  gatherActionUrl?: string;
}

export interface DeliveryResult {
  id: string | null;
  status: "sent" | "failed" | "simulated" | "queued";
  provider: string;
  providerReference?: string | null;
  error?: string | null;
}

let resend: Resend | null = null;
let twilioClient: ReturnType<typeof twilio> | null = null;

function emailConfigured() {
  const e = env();
  return Boolean(e.RESEND_API_KEY && e.RESEND_FROM_EMAIL);
}
function twilioConfigured() {
  const e = env();
  return Boolean(e.TWILIO_ACCOUNT_SID && e.TWILIO_AUTH_TOKEN && e.TWILIO_PHONE_NUMBER);
}

function redact(content: string, msg: OutgoingMessage, simulated: boolean, placeholder: string): string {
  // Secure links are only kept for simulated messages in demo mode, so the demo
  // outbox and e-mail previews work; real deliveries are always stored redacted.
  if (simulated && env().DEMO_TOOLS_ENABLED === "true") return content;
  let out = content;
  // Longest first, so a link that prefixes another is not partially replaced.
  for (const link of [...(msg.secureLinks ?? [])].sort((a, b) => b.length - a.length)) {
    out = out.split(link).join(placeholder);
    out = out.split(link.replace(/&/g, "&amp;")).join(placeholder);
  }
  return out;
}

function preview(msg: OutgoingMessage, simulated: boolean): string {
  return redact(msg.text, msg, simulated, "[secure link redacted]").slice(0, 4000);
}

function htmlCopy(msg: OutgoingMessage, simulated: boolean): string | null {
  if (!msg.html) return null;
  return redact(msg.html, msg, simulated, "#redacted").slice(0, 200_000);
}

function twimlFor(msg: OutgoingMessage): string {
  const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
  const say = esc(msg.voiceText ?? msg.text);
  if (msg.gatherActionUrl) {
    return `<Response><Gather numDigits="1" timeout="10" action="${esc(msg.gatherActionUrl)}" method="POST"><Say>${say} Press 1 to acknowledge this alert.</Say></Gather><Say>No input received. This alert remains unacknowledged.</Say></Response>`;
  }
  return `<Response><Say>${say}</Say></Response>`;
}

async function deliver(msg: OutgoingMessage): Promise<Omit<DeliveryResult, "id">> {
  const e = env();
  if (msg.channel === "email") {
    if (!emailConfigured()) return { status: "simulated", provider: "simulated-email" };
    resend ??= new Resend(e.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: e.RESEND_FROM_EMAIL!,
      to: msg.recipient,
      subject: msg.subject ?? "Fiximperfect update",
      text: msg.text,
      html: msg.html,
    });
    if (error) return { status: "failed", provider: "resend", error: error.message };
    // Accepted by Resend = "sent". Delivery is not claimed without a provider event.
    return { status: "sent", provider: "resend", providerReference: data?.id ?? null };
  }
  if (!twilioConfigured()) return { status: "simulated", provider: `simulated-${msg.channel}` };
  twilioClient ??= twilio(e.TWILIO_ACCOUNT_SID!, e.TWILIO_AUTH_TOKEN!);
  const publicUrl = appUrl().startsWith("https://");
  const statusCallback = publicUrl ? appUrl("/api/webhooks/twilio/status") : undefined;
  if (msg.channel === "sms") {
    const m = await twilioClient.messages.create({ to: msg.recipient, from: e.TWILIO_PHONE_NUMBER!, body: msg.text.slice(0, 1500), statusCallback });
    return { status: m.status === "failed" ? "failed" : "queued", provider: "twilio-sms", providerReference: m.sid, error: m.errorMessage ?? null };
  }
  const c = await twilioClient.calls.create({ to: msg.recipient, from: e.TWILIO_PHONE_NUMBER!, twiml: twimlFor(msg), statusCallback, statusCallbackEvent: publicUrl ? ["completed"] : undefined });
  return { status: c.status === "failed" ? "failed" : "queued", provider: "twilio-voice", providerReference: c.sid };
}

/**
 * Sends one message and records it. The stored status reflects only what the
 * provider confirmed: "simulated" when no provider is configured, "queued" or
 * "sent" when the provider accepted it, "delivered" only after a provider
 * status callback, "failed" on error.
 */
export async function sendNotification(msg: OutgoingMessage): Promise<DeliveryResult> {
  const db = adminClient();
  const { data: row, error } = await db
    .from("notifications")
    .insert({
      ticket_id: msg.ticketId ?? null,
      report_id: msg.reportId ?? null,
      audience: msg.audience,
      recipient: msg.recipient,
      channel: msg.channel,
      notification_type: msg.type,
      subject: msg.subject ?? null,
      delivery_status: "queued",
    })
    .select("id")
    .single();
  if (error) console.error("[notify] could not record notification", error.message);

  let result: Omit<DeliveryResult, "id">;
  try {
    result = await deliver(msg);
  } catch (err) {
    result = { status: "failed", provider: msg.channel, error: err instanceof Error ? err.message : String(err) };
  }
  if (row) {
    await db
      .from("notifications")
      .update({
        delivery_status: result.status,
        provider: result.provider,
        provider_reference: result.providerReference ?? null,
        error_message: result.error ?? null,
        body_preview: preview(msg, result.status === "simulated"),
        body_html: htmlCopy(msg, result.status === "simulated"),
      })
      .eq("id", row.id);
  }
  return { id: row?.id ?? null, ...result };
}

/** Sends several notifications concurrently; failures are recorded, never thrown. */
export async function sendAll(msgs: OutgoingMessage[]): Promise<DeliveryResult[]> {
  return Promise.all(msgs.map((m) => sendNotification(m)));
}

