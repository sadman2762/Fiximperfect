import type { Metadata } from "next";
import { Phone } from "lucide-react";
import { adminClient } from "@/lib/supabase/admin";
import { StudentShell } from "@/components/student/student-shell";
import { EmergencyForm, type EmergencyBuilding } from "@/components/student/emergency-form";

export const metadata: Metadata = { title: "Report an emergency" };
export const dynamic = "force-dynamic";

/**
 * Dedicated emergency entry point. Works without a QR code: the student picks
 * the building and area (the same public information printed on QR labels).
 * Submissions go through the normal report pipeline, so the deterministic
 * safety rules and the staff emergency workflow apply unchanged.
 */
export default async function EmergencyPage({ searchParams }: { searchParams: Promise<{ at?: string }> }) {
  const { at } = await searchParams;
  const db = adminClient();
  const [{ data: buildings }, { data: locations }] = await Promise.all([
    db.from("buildings").select("id, name").order("name"),
    db.from("locations").select("building_id, floor, area_name, qr_slug").order("floor").order("area_name"),
  ]);
  const options: EmergencyBuilding[] = (buildings ?? []).map((b) => ({
    id: b.id as string,
    name: b.name as string,
    locations: (locations ?? [])
      .filter((l) => l.building_id === b.id)
      .map((l) => ({ slug: l.qr_slug as string, label: `Floor ${l.floor} · ${l.area_name}` })),
  }));
  const initialSlug = typeof at === "string" && /^[a-z0-9-]{3,80}$/.test(at) ? at : null;

  return (
    <StudentShell hideEmergency>
      <section className="rise overflow-hidden rounded-2xl bg-gradient-to-br from-[#dc2626] to-[#991b1b] p-5 text-white shadow-[0_16px_40px_-18px_rgba(220,38,38,0.8)]">
        <p className="text-[12px] font-semibold tracking-[0.08em] uppercase opacity-90">Emergency</p>
        <h1 className="mt-1 text-[30px] leading-tight font-bold tracking-[-0.03em] text-white">Report an emergency</h1>
        <p className="mt-2 text-[14px] opacity-95">
          If anyone is hurt or in immediate danger, call the emergency services first. Then tell us here — the caretaker is alerted by text, phone call and e-mail at once.
        </p>
        <a
          href="tel:112"
          className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-white py-3 text-[17px] font-bold text-[#b91c1c] shadow-sm hover:bg-white/90 focus-visible:ring-4 focus-visible:ring-white/50 focus-visible:outline-none"
        >
          <Phone className="size-5" aria-hidden /> Call 112
        </a>
      </section>
      <EmergencyForm buildings={options} initialSlug={initialSlug} />
    </StudentShell>
  );
}
