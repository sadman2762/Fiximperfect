"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, MapPin, ShieldAlert } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/shared/ui-bits";
import { EMERGENCY_PRESETS } from "@/lib/safety/presets";
import { cn } from "@/lib/utils";

export interface EmergencyBuilding {
  id: string;
  name: string;
  locations: { slug: string; label: string }[];
}

interface Result {
  reportNumber: string;
  ticketNumber: string;
  safetyLevel: string;
  safetyAdvice?: string | null;
  trackingUrl: string;
  emailedTo: string;
  emailDelivery: "live" | "simulated";
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-[16px] font-semibold">
        <span className="grid size-6 place-items-center rounded-full bg-[#183247] text-[12px] font-bold text-white">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function EmergencyForm({ buildings, initialSlug }: { buildings: EmergencyBuilding[]; initialSlug: string | null }) {
  const initialBuilding = useMemo(() => buildings.find((b) => b.locations.some((l) => l.slug === initialSlug)) ?? null, [buildings, initialSlug]);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [buildingId, setBuildingId] = useState(initialBuilding?.id ?? (buildings.length === 1 ? buildings[0].id : ""));
  const [slug, setSlug] = useState(initialBuilding ? (initialSlug as string) : "");
  const [details, setDetails] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const preset = EMERGENCY_PRESETS.find((p) => p.id === presetId) ?? null;
  const building = buildings.find((b) => b.id === buildingId) ?? null;
  const location = building?.locations.find((l) => l.slug === slug) ?? null;

  if (result) {
    const critical = result.safetyLevel === "critical";
    return (
      <section aria-live="polite" className="space-y-4">
        <div className={cn("rise flex gap-3 rounded-xl p-4", critical ? "bg-[#dc2626] text-white" : "border border-[#fde3b6] bg-[#fff4e0] text-[#7a4300]")}>
          <ShieldAlert className="mt-0.5 size-6 shrink-0" aria-hidden />
          <div className="text-[14px]">
            <p className="text-[16px] font-semibold">{critical ? "Staff are being alerted now." : "Staff have been told this needs quick attention."}</p>
            <p className="mt-1">
              {result.safetyAdvice ?? "Keep away from the area."} If anyone is in immediate danger, call 112.
            </p>
          </div>
        </div>
        <div className="space-y-3 p-5 surface">
          <p className="flex items-center gap-2 font-semibold text-[#183247]">
            <CheckCircle2 className="size-5 text-[#00866a]" aria-hidden /> Emergency report received
          </p>
          <dl className="grid grid-cols-2 gap-3 text-[14px]">
            <div>
              <dt className="text-[#5f7183]">Your report</dt>
              <dd className="font-mono font-medium">{result.reportNumber}</dd>
            </div>
            <div>
              <dt className="text-[#5f7183]">Ticket</dt>
              <dd className="font-mono font-medium">{result.ticketNumber}</dd>
            </div>
          </dl>
          <p className="text-[13px] text-[#5f7183]">
            {result.emailDelivery === "live" ? `We e-mailed a tracking link to ${result.emailedTo}.` : `A confirmation e-mail for ${result.emailedTo} was recorded (demo mode).`}
          </p>
          <a href={result.trackingUrl} className={cn(buttonVariants({ size: "lg" }), "w-full")}>
            Track this emergency
          </a>
        </div>
      </section>
    );
  }

  return (
    <form
      className="rise rise-1 space-y-6 p-5 surface"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        if (!preset) return setError("Choose what is happening.");
        if (!location) return setError("Choose where you are.");
        if (!name.trim()) return setError("Enter your name.");
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError("Enter a valid e-mail address so we can update you.");
        setBusy(true);
        const fd = new FormData();
        fd.set("qrSlug", location.slug);
        fd.set("description", preset.text);
        if (details.trim()) fd.set("additionalDetails", details.trim());
        fd.set("reporterName", name.trim());
        fd.set("reporterEmail", email.trim());
        try {
          const res = await fetch("/api/reports", { method: "POST", body: fd });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) setError(body.issues?.[0]?.message ?? body.error ?? "The report could not be sent. Call 112 if anyone is in danger.");
          else {
            setResult(body as Result);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
        } catch {
          setError("Network problem — the report was not sent. Call 112 if anyone is in danger.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Step n={1} title="What is happening?">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="What is happening?">
          {EMERGENCY_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={presetId === p.id}
              onClick={() => setPresetId(p.id)}
              className={cn(
                "flex min-h-[64px] items-center gap-2.5 rounded-xl border-2 px-3 py-3 text-left text-[14px] font-semibold transition-colors focus-visible:ring-4 focus-visible:ring-[#dc2626]/25 focus-visible:outline-none",
                presetId === p.id
                  ? "border-[#dc2626] bg-[#dc2626] text-white"
                  : p.level === "critical"
                    ? "border-[#fbd5d5] bg-[#fef2f2] text-[#991b1b] hover:border-[#dc2626]/60"
                    : "border-[#fde3b6] bg-[#fff7ed] text-[#7a4300] hover:border-[#d97706]/60",
              )}
            >
              <span aria-hidden className="text-[22px]">
                {p.icon}
              </span>
              {p.label}
            </button>
          ))}
        </div>
      </Step>

      <Step n={2} title="Where are you?">
        {location && initialSlug === location.slug ? (
          <p className="flex items-center gap-2 rounded-xl border border-[#b9e3d6] bg-[#e6f4f0] px-3 py-2.5 text-[14px] text-[#006b55]">
            <MapPin className="size-4" aria-hidden /> {building?.name} · {location.label} (from the QR code)
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="em-building">Building</Label>
            <NativeSelect
              id="em-building"
              value={buildingId}
              onChange={(e) => {
                setBuildingId(e.target.value);
                setSlug("");
              }}
            >
              <option value="">Choose building</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="em-location">Floor and area</Label>
            <NativeSelect id="em-location" value={slug} onChange={(e) => setSlug(e.target.value)} disabled={!building}>
              <option value="">{building ? "Choose area" : "Choose a building first"}</option>
              {building?.locations.map((l) => (
                <option key={l.slug} value={l.slug}>
                  {l.label}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="em-details">Anything else? (optional)</Label>
          <Textarea id="em-details" rows={2} placeholder="Exactly where, is anyone hurt, how big is it…" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} />
        </div>
      </Step>

      <Step n={3} title="Your details">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="em-name">Your name</Label>
            <Input id="em-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="em-email">Your email</Label>
            <Input id="em-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
      </Step>

      {error ? (
        <p role="alert" className="rounded-xl border border-[#fbd5d5] bg-[#fef2f2] p-3 text-[14px] text-[#b91c1c]">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={busy} className="h-14 w-full bg-[#dc2626] text-[18px] font-bold shadow-[0_8px_20px_-8px_rgba(220,38,38,0.8)] hover:bg-[#b91c1c]">
        {busy ? (
          <>
            <Loader2 className="animate-spin" aria-hidden /> Alerting staff…
          </>
        ) : (
          "Send emergency report"
        )}
      </Button>
    </form>
  );
}
