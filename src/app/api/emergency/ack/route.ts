import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, handleRoute, HttpError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { acknowledgeByToken } from "@/lib/workflows/emergency";

export const POST = handleRoute(async (req: Request) => {
  if (!(await rateLimit("ack-ip", clientIp(req), 30, 600))) throw new HttpError(429, "Too many requests.");
  const { token } = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/) }).parse(await req.json());
  const result = await acknowledgeByToken(token);
  if (!result) throw new HttpError(404, "Invalid acknowledgement link.");
  return NextResponse.json({ ok: true, ...result });
});

