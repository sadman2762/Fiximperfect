import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { QrContext } from "@/types/domain";

const LOCATION_COLUMNS = "id, building_id, floor, area_name, room_number, location_code, qr_slug, location_type";

/**
 * Resolves a QR slug to building + location using ONLY server-side data.
 * One QR code identifies one room or shared space. Old equipment QR labels
 * (deprecated) still work: they open the room the equipment is in.
 */
export async function resolveQr(db: SupabaseClient, slug: string): Promise<QrContext | null> {
  if (!/^[a-z0-9-]{3,80}$/.test(slug)) return null;

  let kind: QrContext["kind"] = "location";
  let { data: location } = await db
    .from("locations")
    .select(`${LOCATION_COLUMNS}, buildings!inner(id, name, code, address)`)
    .eq("qr_slug", slug)
    .maybeSingle();

  if (!location) {
    // Legacy equipment label -> the location the equipment is registered in.
    const { data: legacy } = await db.from("assets").select("location_id").eq("qr_slug", slug).maybeSingle();
    if (!legacy) return null;
    kind = "legacy_asset";
    ({ data: location } = await db
      .from("locations")
      .select(`${LOCATION_COLUMNS}, buildings!inner(id, name, code, address)`)
      .eq("id", legacy.location_id)
      .maybeSingle());
    if (!location) return null;
  }

  const { buildings: building, ...locationRow } = location as unknown as Record<string, unknown> & { buildings: QrContext["building"] };
  const { data: assets } = await db
    .from("assets")
    .select("id, asset_code, asset_name, category")
    .eq("location_id", locationRow.id as string)
    .neq("operational_status", "retired")
    .order("asset_name");

  return {
    kind,
    // Always the location's own permanent slug, even when a legacy label was scanned.
    slug: locationRow.qr_slug as string,
    building,
    location: locationRow as unknown as QrContext["location"],
    locationAssets: assets ?? [],
  };
}
