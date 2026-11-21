import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/security/tokens";
import { runEscalationCheck } from "@/lib/workflows/emergency";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduled acknowledgement-timeout check (Vercel Cron; see vercel.json).
 * Vercel sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const summary = await runEscalationCheck();
  return NextResponse.json({ checkedAt: new Date().toISOString(), summary });
}
