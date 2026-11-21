import { NextResponse } from "next/server";
import { handleRoute, HttpError } from "@/lib/http";
import { requireStaff } from "@/lib/auth/session";
import { sessionClient } from "@/lib/supabase/server";
import { signedImageUrl } from "@/lib/storage/images";

/**
 * Staff-only image access: RLS on the session client confirms the user may see
 * the report, then a 5-minute signed URL for the private bucket is issued.
 */
export const GET = handleRoute(async (_req: Request, ctx: { params: Promise<{ reportId: string }> }) => {
  await requireStaff();
  const { reportId } = await ctx.params;
  const db = await sessionClient();
  const { data } = await db.from("reports").select("image_path").eq("id", reportId).maybeSingle();
  if (!data?.image_path) throw new HttpError(404, "No image");
  const url = await signedImageUrl(data.image_path, 300);
  if (!url) throw new HttpError(404, "Image unavailable");
  return NextResponse.redirect(url, { status: 302, headers: { "cache-control": "private, no-store" } });
});
