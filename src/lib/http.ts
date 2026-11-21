import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError, HttpError } from "@/lib/errors";

export { HttpError };

/**
 * Wraps a route handler with consistent, safe error handling: validation and
 * auth errors become 4xx with a useful message; anything else is logged and
 * returned as a generic 500 without leaking internals.
 */
export function handleRoute<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ZodError) {
        return NextResponse.json(
          { error: "Invalid input", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
          { status: 400 },
        );
      }
      if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
      if (err instanceof HttpError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
      console.error("[route] unhandled error", err);
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}
