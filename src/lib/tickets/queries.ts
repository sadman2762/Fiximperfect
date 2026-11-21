import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { PRIORITIES, TICKET_STATUSES } from "@/types/domain";

export const TicketFilterSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum([...TICKET_STATUSES, "active", "all"]).optional().catch(undefined),
  priority: z.enum(PRIORITIES).optional().catch(undefined),
  category: z.string().max(60).optional().catch(undefined),
  building: z.string().uuid().optional().catch(undefined),
  floor: z.coerce.number().int().min(-5).max(100).optional().catch(undefined),
  location: z.string().uuid().optional().catch(undefined),
  team: z.string().uuid().optional().catch(undefined),
  sort: z.enum(["created_at", "priority", "ticket_number", "status", "updated_at"]).optional().catch(undefined),
  dir: z.enum(["asc", "desc"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).optional().catch(undefined),
});
export type TicketFilters = z.infer<typeof TicketFilterSchema>;

export const PAGE_SIZE = 20;

export interface TicketListRow {
  id: string;
  ticket_number: string;
  title: string;
  category: string;
  priority: "low" | "medium" | "high" | "critical";
  status: (typeof TICKET_STATUSES)[number];
  safety_level: "none" | "low" | "elevated" | "critical";
  escalation_status: string;
  created_at: string;
  ai_mode: string;
  buildings: { name: string };
  locations: { area_name: string; floor: number; room_number: string | null };
  assets: { asset_name: string; asset_code: string } | null;
  maintenance_teams: { team_name: string } | null;
  reports: { count: number }[];
}

/** Server-side filtered, sorted, paginated ticket list. Use with a session client (RLS). */
export async function listTickets(db: SupabaseClient, f: TicketFilters) {
  const page = f.page ?? 1;
  let q = db
    .from("tickets")
    .select(
      "id, ticket_number, title, category, priority, status, safety_level, escalation_status, created_at, ai_mode, buildings(name), locations!inner(area_name, floor, room_number), assets(asset_name, asset_code), maintenance_teams(team_name), reports!reports_ticket_id_fkey(count)",
      { count: "exact" },
    )
    .is("merged_into", null);
  const status = f.status ?? "active";
  if (status === "active") q = q.not("status", "in", "(resolved,closed)");
  else if (status !== "all") q = q.eq("status", status);
  if (f.priority) q = q.eq("priority", f.priority);
  if (f.category) q = q.eq("category", f.category);
  if (f.building) q = q.eq("building_id", f.building);
  if (f.floor !== undefined) q = q.eq("locations.floor", f.floor);
  if (f.location) q = q.eq("location_id", f.location);
  if (f.team) q = q.eq("assigned_team_id", f.team);
  if (f.q) {
    const term = f.q.replace(/[%,()]/g, " ");
    q = q.or(`title.ilike.%${term}%,ticket_number.ilike.%${term}%,description.ilike.%${term}%`);
  }
  const sort = f.sort ?? "created_at";
  // Priority enum order is low<medium<high<critical, so desc = most urgent first.
  q = q.order(sort, { ascending: (f.dir ?? "desc") === "asc" }).order("created_at", { ascending: false });
  q = q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const { data, count, error } = await q;
  if (error) throw new Error(`ticket list failed: ${error.message}`);
  return { rows: (data ?? []) as unknown as TicketListRow[], total: count ?? 0, page, pageSize: PAGE_SIZE };
}

export async function filterOptions(db: SupabaseClient) {
  const [b, t, c, l] = await Promise.all([
    db.from("buildings").select("id, name").order("name"),
    db.from("maintenance_teams").select("id, team_name").order("team_name"),
    db.from("categories").select("name").order("name"),
    db.from("locations").select("id, building_id, floor, area_name, room_number").order("floor").order("area_name"),
  ]);
  return {
    buildings: b.data ?? [],
    teams: t.data ?? [],
    categories: (c.data ?? []).map((x) => x.name as string),
    locations: (l.data ?? []) as { id: string; building_id: string; floor: number; area_name: string; room_number: string | null }[],
  };
}
