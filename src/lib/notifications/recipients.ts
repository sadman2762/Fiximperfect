import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { appUrl } from "@/lib/env";
import { placeName } from "@/lib/locations/label";

export interface StaffRecipient {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
}

/** Active caretakers with access to the building. */
export async function caretakersFor(db: SupabaseClient, buildingId: string): Promise<StaffRecipient[]> {
  const { data } = await db
    .from("profiles")
    .select("id, full_name, email, phone")
    .eq("role", "caretaker")
    .eq("is_active", true)
    .contains("building_access", [buildingId]);
  return data ?? [];
}

export async function teamMembersFor(db: SupabaseClient, teamId: string | null): Promise<StaffRecipient[]> {
  if (!teamId) return [];
  const { data } = await db.from("team_members").select("profiles!inner(id, full_name, email, phone, is_active)").eq("team_id", teamId);
  return ((data ?? []) as unknown as { profiles: StaffRecipient & { is_active: boolean } }[])
    .map((r) => r.profiles)
    .filter((p) => p.is_active);
}

export async function managementRecipients(db: SupabaseClient): Promise<StaffRecipient[]> {
  const { data } = await db.from("profiles").select("id, full_name, email, phone").eq("role", "management").eq("is_active", true);
  return data ?? [];
}

/** Issues an additional tracking token for a report (e.g. for a status update email). */
export async function issueTrackingLink(db: SupabaseClient, reportId: string, ttlDays = 180): Promise<string> {
  const token = generateToken();
  const { error } = await db.from("student_access_tokens").insert({
    purpose: "tracking",
    report_id: reportId,
    token_hash: hashToken(token),
    expires_at: new Date(Date.now() + ttlDays * 86_400_000).toISOString(),
  });
  if (error) throw new Error(`could not issue tracking link: ${error.message}`);
  return appUrl(`/track/${token}`);
}

export function ticketUrl(ticketId: string) {
  return appUrl(`/tickets/${ticketId}`);
}

/** Loads everything a student e-mail needs about one report and its ticket. */
export async function studentEmailContext(db: SupabaseClient, reportId: string, trackingUrl: string) {
  const { data } = await db
    .from("reports")
    .select(
      "ticket_id, reporter_name, report_number, locations(area_name, floor, room_number, buildings(name)), assets(asset_name), tickets!reports_ticket_id_fkey(ticket_number, category, status, safety_level, resolution_verified)",
    )
    .eq("id", reportId)
    .single();
  const r = data as unknown as {
    ticket_id: string | null;
    reporter_name: string;
    report_number: string;
    locations: { area_name: string; floor: number; room_number: string | null; buildings: { name: string } };
    assets: { asset_name: string } | null;
    tickets: { ticket_number: string; category: string; status: import("@/types/domain").TicketStatus; safety_level: string; resolution_verified: boolean } | null;
  };
  const { count } = r.ticket_id ? await db.from("reports").select("id", { count: "exact", head: true }).eq("ticket_id", r.ticket_id) : { count: 1 };
  return {
    name: r.reporter_name,
    reportNumber: r.report_number,
    ticketNumber: r.tickets?.ticket_number ?? "",
    building: r.locations.buildings.name,
    floor: r.locations.floor,
    area: placeName(r.locations),
    asset: r.assets?.asset_name ?? null,
    category: r.tickets?.category ?? "General",
    status: r.tickets?.status ?? "submitted",
    verified: r.tickets?.resolution_verified ?? false,
    critical: r.tickets?.safety_level === "critical",
    linkedReports: count ?? 1,
    trackingUrl,
  };
}
