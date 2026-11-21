import QRCode from "qrcode";
import { handleRoute, HttpError } from "@/lib/http";
import { requireStaff } from "@/lib/auth/session";
import { appUrl } from "@/lib/env";

/** QR label image for a location/asset slug (encodes only the public report URL). */
export const GET = handleRoute(async (req: Request, ctx: { params: Promise<{ slug: string }> }) => {
  await requireStaff(["administrator", "caretaker"]);
  const { slug } = await ctx.params;
  if (!/^[a-z0-9-]{3,80}$/.test(slug)) throw new HttpError(404, "Unknown QR code");
  const url = appUrl(`/report/${slug}`);
  const format = new URL(req.url).searchParams.get("format") === "png" ? "png" : "svg";
  if (format === "png") {
    const buf = await QRCode.toBuffer(url, { type: "png", width: 600, margin: 2, errorCorrectionLevel: "M" });
    return new Response(new Uint8Array(buf), {
      headers: { "content-type": "image/png", "content-disposition": `attachment; filename="qr-${slug}.png"` },
    });
  }
  const svg = await QRCode.toString(url, { type: "svg", margin: 2, errorCorrectionLevel: "M" });
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "content-disposition": `inline; filename="qr-${slug}.svg"` } });
});
