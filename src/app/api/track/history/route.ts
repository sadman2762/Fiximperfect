import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, handleRoute, HttpError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { adminClient } from "@/lib/supabase/admin";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { appUrl } from "@/lib/env";
import { sendNotification } from "@/lib/notifications/dispatcher";
import { historyLink } from "@/lib/notifications/templates";

/** Emails a 24h history link. The response never reveals whether the email has reports. */
export const POST = handleRoute(async (req: Request) => {
  const { email } = z.object({ email: z.string().trim().toLowerCase().email().max(254) }).parse(await req.json());
  if (!(await rateLimit("history-ip", clientIp(req), 5, 600)) || !(await rateLimit("history-email", email, 3, 3600))) {
    throw new HttpError(429, "Too many requests. Please try again later.");
  }
  const db = adminClient();
  const { count } = await db.from("reports").select("id", { count: "exact", head: true }).eq("reporter_email", email);
  if (count) {
    const token = generateToken();
    await db.from("student_access_tokens").insert({
      purpose: "history",
      reporter_email: email,
      token_hash: hashToken(token),
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const url = appUrl(`/track/history/${token}`);
    await sendNotification({ audience: "student", channel: "email", recipient: email, type: "history_link", ...historyLink({ url }), secureLinks: [url] });
  }
  return NextResponse.json({ message: "If reports exist for this address, a link is on its way. Check your inbox." });
});
