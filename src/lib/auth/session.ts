import "server-only";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { sessionClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import type { StaffProfile, StaffRole } from "@/types/domain";
import { AuthError } from "@/lib/errors";

export { AuthError };
export { canReadBuilding, canManageTicket, canCoordinateTicket, teamIdsFor } from "@/lib/auth/permissions";

/** Returns the signed-in, active staff profile or null. */
export async function getStaff(): Promise<StaffProfile | null> {
  const supabase = await sessionClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await adminClient()
    .from("profiles")
    .select("id, full_name, email, phone, role, building_access, is_active")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profile || !profile.is_active) return null;
  return profile as StaffProfile;
}

/** For route handlers: throws AuthError (mapped to 401/403 by `handleRoute`). */
export async function requireStaff(roles?: StaffRole[]): Promise<StaffProfile> {
  const staff = await getStaff();
  if (!staff) throw new AuthError("Sign in required", 401);
  if (roles && !roles.includes(staff.role)) throw new AuthError("Insufficient permissions", 403);
  return staff;
}

/** For server components/pages: redirects instead of throwing. */
export async function requireStaffPage(roles?: StaffRole[]): Promise<StaffProfile> {
  const staff = await getStaff();
  if (!staff) {
    const path = (await headers()).get("x-fi-path");
    redirect(path && path.startsWith("/") && !path.startsWith("//") ? `/login?next=${encodeURIComponent(path)}` : "/login");
  }
  if (roles && !roles.includes(staff.role)) redirect("/dashboard?denied=1");
  return staff;
}

