import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CheckCircle2, MapPin } from "lucide-react";
import { adminClient } from "@/lib/supabase/admin";
import { resolveQr } from "@/lib/assets/qr";
import { ReportForm } from "@/components/student/report-form";
import { StudentShell } from "@/components/student/student-shell";

export const metadata: Metadata = { title: "Report a problem" };
export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ qrSlug: string }> }) {
  const { qrSlug } = await params;
  const qr = await resolveQr(adminClient(), qrSlug);
  if (!qr) notFound();

  return (
    <StudentShell>
      <section className="rise text-center">
        <p className="eyebrow">Report a problem</p>
        <h1 className="mt-3 text-[38px] leading-none font-bold tracking-[-0.035em]">{qr.asset ? qr.asset.asset_name : qr.location.area_name}</h1>
        <p className="mt-1.5 inline-flex items-center gap-1.5 text-[15px] text-muted-foreground">
          <MapPin className="size-4" aria-hidden />
          {qr.building.name} · Floor {qr.location.floor}
          {qr.asset ? ` · ${qr.location.area_name}` : ""}
        </p>
        <p className="mx-auto mt-4 inline-flex items-center gap-1.5 border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-1 text-xs text-[#15803d]">
          <CheckCircle2 className="size-3.5 text-[#15803d]" aria-hidden />
          Location identified from the QR code{qr.asset ? ` · ${qr.asset.asset_code}` : ""}
        </p>
      </section>
      <ReportForm
        qrSlug={qr.slug}
        assetName={qr.asset?.asset_name ?? null}
        locationAssets={qr.locationAssets.map((a) => ({ id: a.id, label: `${a.asset_name} (${a.asset_code})` }))}
      />
    </StudentShell>
  );
}
