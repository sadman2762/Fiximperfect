import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import type { StaffProfile } from "@/types/domain";

/** Pure role/building authorisation rules (mirrored by RLS policies in the database). */
export function canReadBuilding(staff: StaffProfile, buildingId: string): boolean {
  return staff.role === "administrator" || staff.role === "management" || staff.building_access.includes(buildingId);
}

/** Who may change ticket fields (assignment, priority, status, costs). */
export function canManageTicket(
  staff: StaffProfile,
  ticket: { building_id: string; assigned_to: string | null; assigned_team_id: string | null },
  teamIds: string[] = [],
): boolean {
  if (staff.role === "administrator") return true;
  if (staff.role === "caretaker") return staff.building_access.includes(ticket.building_id);
  if (staff.role === "maintenance_staff") {
    return (
      staff.building_access.includes(ticket.building_id) &&
      (ticket.assigned_to === staff.id || (ticket.assigned_team_id !== null && teamIds.includes(ticket.assigned_team_id)))
    );
  }
  return false; // management: read-only
}

/** Caretaker-level powers (assignment, priority override, closing, merging). */
export function canCoordinateTicket(staff: StaffProfile, ticket: { building_id: string }): boolean {
  if (staff.role === "administrator") return true;
  return staff.role === "caretaker" && staff.building_access.includes(ticket.building_id);
}

export async function teamIdsFor(staffId: string): Promise<string[]> {
  const { data } = await adminClient().from("team_members").select("team_id").eq("profile_id", staffId);
  return (data ?? []).map((r) => r.team_id as string);
}
