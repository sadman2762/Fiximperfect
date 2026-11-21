import "server-only";
import twilio from "twilio";
import { env } from "@/lib/env";

/** Validates X-Twilio-Signature against the public URL and form parameters. */
export async function verifyTwilioRequest(req: Request): Promise<Record<string, string> | null> {
  const token = env().TWILIO_AUTH_TOKEN;
  if (!token) return null;
  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") params[k] = v;
  const signature = req.headers.get("x-twilio-signature") ?? "";
  const url = new URL(req.url);
  const publicUrl = `${env().NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}${url.pathname}${url.search}`;
  return twilio.validateRequest(token, signature, publicUrl, params) ? params : null;
}

