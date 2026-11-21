import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DuplicateCandidate } from "@/lib/agents/schemas";

/**
 * Stage 1 of duplicate detection: deterministic candidate retrieval in SQL.
 * Only active tickets in the same building, recent, and either in the same
 * room/location (one QR code = one location), on the same identified asset,
 * or the same category on the same floor (e.g. a floor-wide heating fault).
 * Different problems in the same room are separated by the scorer, which
 * weighs equipment category and the fault descriptions.
 */
export async function retrieveCandidates(
  db: SupabaseClient,
  params: {
    buildingId: string;
    locationId: string;
    floor: number;
    assetId: string | null;
    category: string;
    windowDays: number;
    limit?: number;
  },
): Promise<DuplicateCandidate[]> {
  const since = new Date(Date.now() - params.windowDays * 86_400_000).toISOString();
  const { data, error } = await db
    .from("tickets")
    .select(
      "id, ticket_number, category, title, description, status, created_at, asset_id, location_id, " +
        "assets(asset_code, asset_name), locations!inner(area_name, floor, room_number), reports!reports_ticket_id_fkey(description, created_at)",
    )
    .eq("building_id", params.buildingId)
    .is("merged_into", null)
    .in("status", ["submitted", "needs_review", "assigned", "in_progress", "waiting_for_parts", "reopened", "resolved"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`candidate retrieval failed: ${error.message}`);

  type Row = {
    id: string;
    ticket_number: string;
    category: string;
    title: string;
    description: string;
    status: string;
    created_at: string;
    asset_id: string | null;
    location_id: string;
    assets: { asset_code: string; asset_name: string } | null;
    locations: { area_name: string; floor: number; room_number: string | null };
    reports: { description: string; created_at: string }[];
  };
  const rows = (data ?? []) as unknown as Row[];

  const scored = rows
    .map((r) => {
      let relevance = 0;
      if (params.assetId && r.asset_id === params.assetId) relevance += 4;
      if (r.location_id === params.locationId) relevance += 3;
      if (r.category.toLowerCase() === params.category.toLowerCase()) relevance += 3;
      if (r.locations.floor === params.floor) relevance += 1;
      return { r, relevance };
    })
    // Must share the asset, or the location, or (category AND floor).
    .filter(
      ({ r }) =>
        (params.assetId && r.asset_id === params.assetId) ||
        r.location_id === params.locationId ||
        (r.category.toLowerCase() === params.category.toLowerCase() && r.locations.floor === params.floor),
    )
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, params.limit ?? 5);

  return scored.map(({ r }) => ({
    id: r.id,
    location_id: r.location_id,
    ticket_number: r.ticket_number,
    category: r.category,
    title: r.title,
    description: r.description,
    status: r.status,
    asset_code: r.assets?.asset_code ?? null,
    asset_name: r.assets?.asset_name ?? null,
    area_name: r.locations.room_number ? `Room ${r.locations.room_number}` : r.locations.area_name,
    floor: r.locations.floor,
    created_at: r.created_at,
    report_descriptions: (r.reports ?? [])
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(0, 3)
      .map((x) => x.description.slice(0, 400)),
  }));
}

