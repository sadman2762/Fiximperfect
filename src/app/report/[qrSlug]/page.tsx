import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CheckCircle2, MapPin } from "lucide-react";
import { adminClient } from "@/lib/supabase/admin";
import { resolveQr } from "@/lib/assets/qr";
import { ReportForm } from "@/components/student/report-form";
import { StudentShell } from "@/components/student/student-shell";
import { placeName } from "@/lib/locations/label";

export const metadata: Metadata = { title: "Report a problem" };
export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ qrSlug: string }> }) {
  const { qrSlug } = await params;
  const qr = await resolveQr(adminClient(), qrSlug);
  if (!qr) notFound();

  return (
    <StudentShell emergencyAt={qr.location.qr_slug}>
      <section className="rise text-center">
        <p className="eyebrow">Report a problem</p>
        <h1 className="mt-3 text-[38px] leading-none font-bold tracking-[-0.035em]">{placeName(qr.location)}</h1>
        {qr.location.room_number && qr.location.area_name !== placeName(qr.location) ? <p className="mt-1 text-[15px] text-muted-foreground">{qr.location.area_name}</p> : null}
        <p className="mt-1.5 inline-flex items-center gap-1.5 text-[15px] text-muted-foreground">
          <MapPin className="size-4" aria-hidden />
          {qr.building.name} · Floor {qr.location.floor}
        </p>
        <dl className="mx-auto mt-5 grid max-w-sm grid-cols-[1.7fr_0.8fr_1fr] overflow-hidden rounded-2xl border border-[#e1e5eb] bg-white text-left" aria-label="Location from the QR code">
          {[
            ["Dormitory", qr.building.name],
            ["Floor", String(qr.location.floor)],
            [qr.location.room_number ? "Room" : "Area", qr.location.room_number ?? qr.location.area_name],
          ].map(([k, v], i) => (
            <div key={k} className={i > 0 ? "border-l border-[#e1e5eb] px-3 py-2.5" : "px-3 py-2.5"}>
              <dt className="text-[11px] font-medium tracking-[0.04em] text-muted-foreground uppercase">{k}</dt>
              <dd className="mt-0.5 text-[14px] leading-snug font-semibold break-words text-[#0b1f3a]">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-1 text-xs text-[#15803d]">
          <CheckCircle2 className="size-3.5 text-[#15803d]" aria-hidden />
          Location identified from the QR code · {qr.location.location_code}
        </p>
      </section>
      <ReportForm qrSlug={qr.slug} />
    </StudentShell>
  );
}
