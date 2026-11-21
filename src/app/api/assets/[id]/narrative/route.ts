import { NextResponse } from "next/server";
import { handleRoute, HttpError } from "@/lib/http";
import { requireStaff } from "@/lib/auth/session";
import { sessionClient } from "@/lib/supabase/server";
import { assetNarrative, loadAssetStats } from "@/lib/assets/intelligence";

export const maxDuration = 60;

export const POST = handleRoute(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireStaff(["caretaker", "administrator", "management"]);
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "Asset not found");
  const db = await sessionClient();
  const [stats] = await loadAssetStats(db, id);
  if (!stats) throw new HttpError(404, "Asset not found");
  const { data: tickets } = await db.from("tickets").select("id, ticket_number, created_at, title").eq("asset_id", id).is("merged_into", null).order("created_at");
  const { data: costs } = await db.from("maintenance_costs").select("ticket_id, total_cost").eq("asset_id", id);
  const history = (tickets ?? []).map((t) => ({
    ticket_number: t.ticket_number,
    created_at: t.created_at,
    title: t.title,
    total_cost: costs?.filter((c) => c.ticket_id === t.id).map((c) => c.total_cost).join(" + ") || null,
  }));
  try {
    return NextResponse.json(await assetNarrative(stats, history));
  } catch (e) {
    throw new HttpError(503, `AI explanation unavailable: ${e instanceof Error ? e.message : "error"}. The figures above remain valid.`);
  }
});
