import { NextResponse } from "next/server";
import { clientIp, handleRoute, HttpError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { FeedbackSchema } from "@/lib/validations/schemas";
import { FeedbackError, submitFeedback } from "@/lib/workflows/resolution";

export const POST = handleRoute(async (req: Request) => {
  if (!(await rateLimit("feedback-ip", clientIp(req), 30, 600))) throw new HttpError(429, "Too many requests.");
  const input = FeedbackSchema.parse(await req.json());
  try {
    const result = await submitFeedback(input.token, input.response, input.comment);
    return NextResponse.json({ ok: true, reopened: result.reopened, verified: result.verified });
  } catch (err) {
    if (err instanceof FeedbackError) throw new HttpError(err.code === "not_found" ? 404 : 409, err.message);
    throw err;
  }
});
