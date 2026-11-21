import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRoute, HttpError } from "@/lib/http";
import { requireStaff } from "@/lib/auth/session";
import { sessionClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { askManagementAgent } from "@/lib/agents/management-chat";

export const maxDuration = 60;

export const POST = handleRoute(async (req: Request) => {
  const staff = await requireStaff(["management", "administrator", "caretaker"]);
  if (!(await rateLimit("chat", staff.id, 30, 600))) throw new HttpError(429, "Too many questions — please wait a moment.");
  const { question } = z.object({ question: z.string().trim().min(3).max(500) }).parse(await req.json());
  try {
    // The session client means every tool query is limited by RLS to this user's buildings.
    return NextResponse.json(await askManagementAgent(await sessionClient(), question));
  } catch (e) {
    console.error("[chat]", e);
    throw new HttpError(503, "The assistant is unavailable right now. Dashboard figures are unaffected.");
  }
});

