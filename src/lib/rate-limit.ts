import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/security/tokens";

/**
 * Fixed-window rate limiting backed by Postgres (works across serverless
 * instances). Bucket keys are hashed so raw IPs/emails are not stored.
 */
export async function rateLimit(kind: string, key: string, max: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await adminClient().rpc("check_rate_limit", {
    p_bucket: `${kind}:${hashToken(key).slice(0, 32)}`,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("[rate-limit] check failed; allowing request", error.message);
    return true;
  }
  return data === true;
}
