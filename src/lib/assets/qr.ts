import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { QrContext } from "@/types/domain";

/**
 * Resolves a QR slug to building/location/asset using ONLY server-side data.
 * Asset QR codes resolve to that asset; location QR codes list the assets at
 * the location so the student can optionally pick one.
 */
export async function resolveQr(db: SupabaseClient, slug: string): Promise<QrContext | null> {
  if (!/^[a-z0-9-]{3,80}$/.test(slug)) return null;

  const { data: asset } = await db
    .from("assets")
    .select("*, locations!inner(*), buildings!inner(id, name, code, address)")
    .eq("qr_slug", slug)
    .neq("operational_status", "retired")
    .maybeSingle();

  if (asset) {
    const { locations: location, buildings: building, ...assetRow } = asset as Record<string, unknown> & {
      locations: QrContext["location"];
      buildings: QrContext["building"];
    };
    return {
      kind: "asset",
      slug,
      building,
      location,
      asset: assetRow as unknown as QrContext["asset"],
      locationAssets: [],
    };
  }

  const { data: location } = await db
    .from("locations")
    .select("*, buildings!inner(id, name, code, address)")
    .eq("qr_slug", slug)
    .maybeSingle();
  if (!location) return null;
  const { buildings: building, ...locationRow } = location as Record<string, unknown> & { buildings: QrContext["building"] };
  const { data: assets } = await db
    .from("assets")
    .select("id, asset_code, asset_name, category")
    .eq("location_id", location.id)
    .neq("operational_status", "retired")
    .order("asset_name");
  return {
    kind: "location",
    slug,
    building,
    location: locationRow as unknown as QrContext["location"],
    asset: null,
    locationAssets: assets ?? [],
  };
}
