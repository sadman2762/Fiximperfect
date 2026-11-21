import { verifyTwilioRequest } from "@/lib/notifications/twilio-webhook";
import { acknowledgeByAlertId } from "@/lib/workflows/emergency";

/** Voice-call keypress: pressing 1 acknowledges the emergency alert. */
export async function POST(req: Request) {
  const params = await verifyTwilioRequest(req);
  if (!params) return new Response("forbidden", { status: 403 });
  const alertId = new URL(req.url).searchParams.get("alert");
  let say = "No acknowledgement recorded.";
  if (alertId && /^[0-9a-f-]{36}$/i.test(alertId) && params.Digits === "1") {
    const res = await acknowledgeByAlertId(alertId, `Voice call keypress (${params.To ?? "contact"})`);
    if (res) say = "Thank you. The alert is acknowledged.";
  }
  return new Response(`<Response><Say>${say}</Say></Response>`, { headers: { "content-type": "text/xml" } });
}

