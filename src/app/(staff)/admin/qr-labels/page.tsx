import type { Metadata } from "next";
import QRCode from "qrcode";
import { requireStaffPage } from "@/lib/auth/session";
import { sessionClient } from "@/lib/supabase/server";
import { appUrl } from "@/lib/env";
import { PrintButton } from "@/components/admin/print-button";

export const metadata: Metadata = { title: "QR label sheet" };

/** Printable A4 sheet of QR labels for every location and asset. */
export default async function QrLabelsPage() {
  await requireStaffPage(["administrator", "caretaker"]);
  const db = await sessionClient();
  const [{ data: buildings }, { data: locations }, { data: assets }] = await Promise.all([
    db.from("buildings").select("id, name"),
    db.from("locations").select("qr_slug, area_name, floor, building_id"),
    db.from("assets").select("qr_slug, asset_name, asset_code, building_id").not("qr_slug", "is", null),
  ]);
  const bName = (id: string) => (buildings ?? []).find((b) => b.id === id)?.name ?? "";
  const labels = [
    ...(assets ?? []).map((a) => ({ slug: a.qr_slug as string, title: a.asset_name, sub: `${a.asset_code} · ${bName(a.building_id)}` })),
    ...(locations ?? []).map((l) => ({ slug: l.qr_slug, title: l.area_name, sub: `${bName(l.building_id)} · floor ${l.floor}` })),
  ];
  const svgs = await Promise.all(labels.map((l) => QRCode.toString(appUrl(`/report/${l.slug}`), { type: "svg", margin: 1, errorCorrectionLevel: "M" })));
  return (
    <div>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <h1 className="text-xl font-semibold">QR label sheet</h1>
        <PrintButton />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 print:grid-cols-3">
        {labels.map((l, i) => (
          <div key={l.slug} className="break-inside-avoid rounded-xl border-2 border-dashed p-3 text-center">
            <p className="text-sm font-bold">Something broken?</p>
            <p className="text-xs">Scan to report — no login needed</p>
            <div className="mx-auto my-2 w-36" dangerouslySetInnerHTML={{ __html: svgs[i] }} />
            <p className="text-sm font-semibold">{l.title}</p>
            <p className="text-xs text-muted-foreground">{l.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
