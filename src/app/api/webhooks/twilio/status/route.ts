import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { verifyTwilioRequest } from "@/lib/notifications/twilio-webhook";

/** Twilio delivery callbacks: the only way a message becomes "delivered". */
export async function POST(req: Request) {
  const params = await verifyTwilioRequest(req);
  if (!params) return NextResponse.json({ error: "invalid signature" }, { status: 403 });
  const sid = params.MessageSid ?? params.CallSid;
  const raw = (params.MessageStatus ?? params.CallStatus ?? "").toLowerCase();
  const status = ["delivered", "completed"].includes(raw) ? "delivered" : ["failed", "undelivered", "busy", "no-answer", "canceled"].includes(raw) ? "failed" : "sent";
  if (sid) {
    const db = adminClient();
    const patch = { delivery_status: status, ...(status === "failed" ? { error_message: `Twilio status: ${raw}` } : {}) };
    await db.from("notifications").update({ ...patch, delivered_at: status === "delivered" ? new Date().toISOString() : null }).eq("provider_reference", sid);
    await db.from("emergency_alerts").update(patch).eq("provider_reference", sid);
  }
  return new NextResponse(null, { status: 204 });
}

