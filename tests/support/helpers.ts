import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/supabase/admin";
import { DEMO_PASSWORD } from "@/lib/demo/seed";
import type { StaffProfile } from "@/types/domain";

export const db = () => adminClient();

export function anonClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
}

/** A client authenticated as a demo staff member (RLS applies exactly as in the app). */
export async function staffClient(email: string): Promise<SupabaseClient> {
  const c = anonClient();
  const { error } = await c.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return c;
}

export async function staffProfile(email: string): Promise<StaffProfile> {
  const { data } = await db().from("profiles").select("id, full_name, email, phone, role, building_access, is_active").eq("email", email).single();
  return data as StaffProfile;
}

export async function assertStackUp() {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`);
    if (!res.ok) throw new Error(String(res.status));
  } catch (e) {
    throw new Error(`Supabase is not reachable at ${process.env.NEXT_PUBLIC_SUPABASE_URL} (${e}). Start it with "npm run stack:up" or point .env.local at a Supabase project.`);
  }
}

/** 32×32 PNG generated in memory. */
export function tinyPng(): Uint8Array {
  // Pre-built minimal valid PNG (1×1 transparent pixel).
  return Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
}
