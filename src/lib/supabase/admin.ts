import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let admin: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses RLS — use ONLY in server code after the caller
 * has been authenticated/authorised (or for token-verified public workflows).
 */
export function adminClient(): SupabaseClient {
  if (admin) return admin;
  const e = env();
  admin = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}
