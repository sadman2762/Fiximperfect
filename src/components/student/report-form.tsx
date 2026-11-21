"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Camera, CheckCircle2, Copy, Loader2, Mail, ShieldAlert, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/shared/ui-bits";
import { PriorityBadge, StatusBadge, AiModeBadge } from "@/components/shared/badges";
import type { Priority, TicketStatus } from "@/types/domain";

const schema = z.object({
  description: z.string().trim().min(3, "Please describe the problem").max(2000),
  additionalDetails: z.string().max(2000).optional(),
  reporterName: z.string().trim().min(1, "Please enter your name").max(120),
  reporterEmail: z.string().trim().email("Please enter a valid email address"),
  selectedAssetId: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

interface Result {
  reportNumber: string;
  ticketNumber: string;
  ticketStatus: TicketStatus;
  category: string;
  priority: Priority;
  safetyLevel: string;
  safetyAdvice?: string | null;
  linkedReports: number;
  linkStatus: string;
  trackingUrl: string;
  aiMode: string;
  emailedTo: string;
  emailDelivery: "live" | "simulated";
  emailPreviewUrl: string | null;
}

const MAX = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export function ReportForm({ qrSlug, assetName, locationAssets }: { qrSlug: string; assetName: string | null; locationAssets: { id: string; label: string }[] }) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  const { register, handleSubmit, formState } = useForm<FormValues>({ resolver: zodResolver(schema) });

  function pickPhoto(file: File | undefined) {
    setPhotoError(null);
    if (!file) return;
    if (!TYPES.includes(file.type)) return setPhotoError("Please choose a JPEG, PNG, WebP or GIF photo.");
    if (file.size > MAX) return setPhotoError("That photo is larger than 5 MB.");
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
  }

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const fd = new FormData();
    fd.set("qrSlug", qrSlug);
    fd.set("description", values.description);
    if (values.additionalDetails) fd.set("additionalDetails", values.additionalDetails);
    fd.set("reporterName", values.reporterName);
    fd.set("reporterEmail", values.reporterEmail);
    if (values.selectedAssetId) fd.set("selectedAssetId", values.selectedAssetId);
    if (photo) fd.set("photo", photo);
    try {
      const res = await fetch("/api/reports", { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setServerError(body.issues?.[0]?.message ?? body.error ?? "Your report could not be sent. Please try again.");
        return;
      }
      setResult(body as Result);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setServerError("Network problem — please check your connection and try again.");
    }
  }

  if (result) {
    return (
      <section aria-live="polite" className="space-y-4">
        {result.safetyLevel === "critical" ? (
          <div className="rise flex gap-3 rounded-xl bg-gradient-to-br from-[#ff453a] to-[#d70015] p-4 text-white shadow-[0_12px_30px_-12px_rgba(215,0,21,0.6)]">
            <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="text-sm">
              <p className="font-semibold">Safety hazard detected — staff are being alerted now.</p>
              <p className="mt-1 opacity-90">{result.safetyAdvice ?? "Keep away from the area."} If anyone is in immediate danger, call 112.</p>
            </div>
          </div>
        ) : result.safetyAdvice ? (
          <div className="rise flex gap-3 rounded-xl border border-[#fde3b6] bg-[#fff4e0] p-4 text-[#7a4300]">
            <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="text-sm">
              <p className="font-semibold">Staff have been told this needs quick attention.</p>
              <p className="mt-1">{result.safetyAdvice}</p>
            </div>
          </div>
        ) : null}
        <div className="pt-4 text-center">
          <span className="pop mx-auto grid size-20 place-items-center rounded-full bg-gradient-to-br from-[#30d158] to-[#248a3d] text-white shadow-[0_12px_30px_-10px_rgba(36,138,61,0.6)]">
            <CheckCircle2 className="size-10" strokeWidth={2.2} aria-hidden />
          </span>
          <h2 className="rise rise-1 mt-5 text-[28px] font-bold tracking-[-0.03em]">Thanks — we’re on it.</h2>
          <p className="rise rise-2 mx-auto mt-1.5 max-w-sm text-[15px] text-muted-foreground">
            {result.linkStatus === "auto_linked"
              ? `Others reported this too. Your report joined the existing ticket (${result.linkedReports} reports) — you’ll still get your own updates.`
              : "Your report has been analysed and sent to the right maintenance team."}
          </p>
        </div>

        <dl className="rise rise-2 divide-y divide-[#e1e5eb] overflow-hidden rounded-xl bg-card text-[15px] surface">
          {[
            ["Your report", <span key="r" className="font-mono text-[14px]">{result.reportNumber}</span>],
            ["Ticket", <span key="t" className="font-mono text-[14px]">{result.ticketNumber}</span>],
            ["Category", result.category],
            ["Priority", <PriorityBadge key="p" priority={result.priority} />],
            ["Status", <StatusBadge key="s" status={result.ticketStatus} />],
            ["Analysis", <AiModeBadge key="a" mode={result.aiMode} />],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="rise rise-3 overflow-hidden rounded-xl bg-card surface">
          <div className="flex items-start gap-3 bg-[#e8f2ff] px-4 py-3.5">
            <Mail className="mt-0.5 size-5 shrink-0 text-[#0071e3]" aria-hidden />
            <div className="min-w-0 text-[14px]">
              <p className="font-semibold text-[#005bb5]">
                {result.emailDelivery === "live" ? "Confirmation e-mail sent" : "Confirmation e-mail ready"}
              </p>
              <p className="truncate text-[#0b1f3a]/70">
                {result.emailDelivery === "live" ? `Check ${result.emailedTo} — we'll e-mail you at every step.` : `Addressed to ${result.emailedTo}. Demo mode: e-mail delivery isn't connected.`}
              </p>
              {result.emailPreviewUrl ? (
                <a href={result.emailPreviewUrl} className="mt-1 inline-block font-medium text-[#0071e3] hover:underline">
                  View the e-mail →
                </a>
              ) : null}
            </div>
          </div>
          <div className="p-4">
          <p className="text-[15px] font-semibold">Your private tracking link</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">It’s the only way to view your report. We emailed it to you too.</p>
          <div className="mt-3 flex gap-2">
            <Input readOnly value={result.trackingUrl} aria-label="Tracking link" className="font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(result.trackingUrl);
                setCopied(true);
              }}
            >
              <Copy aria-hidden /> {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <a href={result.trackingUrl} className={`${buttonVariants({ size: "lg" })} mt-4 w-full`}>
            Track my report
          </a>
          </div>
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="rise rise-1 space-y-5 rounded-xl bg-card p-5 surface" noValidate>
      {locationAssets.length > 0 ? (
        <div className="space-y-1.5">
          <Label htmlFor="selectedAssetId">Which equipment? (optional)</Label>
          <NativeSelect id="selectedAssetId" {...register("selectedAssetId")} defaultValue="">
            <option value="">Not sure / something else</option>
            {locationAssets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="description">What is wrong{assetName ? ` with ${assetName}` : ""}?</Label>
        <Textarea id="description" rows={4} placeholder="e.g. The door will not close and the machine won't start." aria-invalid={!!formState.errors.description} {...register("description")} />
        {formState.errors.description ? <p className="text-sm text-destructive">{formState.errors.description.message}</p> : null}
      </div>

      <div className="space-y-1.5">
        <Label>Photo (optional, helps us fix it faster)</Label>
        {preview ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Selected photo preview" className="max-h-64 w-full rounded-xl object-cover" />
            <Button
              type="button"
              size="icon-sm"
              variant="secondary"
              className="absolute top-2 right-2"
              aria-label="Remove photo"
              onClick={() => {
                setPhoto(null);
                setPreview(null);
              }}
            >
              <X aria-hidden />
            </Button>
          </div>
        ) : (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl bg-[#f7f9fc] p-6 text-[14px] text-[#0071e3] transition-colors hover:bg-[#f1f3f6]">
            <Camera className="size-7" strokeWidth={1.6} aria-hidden /> <span className="font-medium">Take or choose a photo</span>
            <span className="text-xs text-muted-foreground">JPEG, PNG, WebP or GIF · up to 5 MB</span>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" className="sr-only" onChange={(e) => pickPhoto(e.target.files?.[0])} />
          </label>
        )}
        {photoError ? <p className="text-sm text-destructive">{photoError}</p> : null}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Add more details (optional)</summary>
        <Textarea className="mt-2" rows={3} placeholder="When did it start? Anything else we should know?" {...register("additionalDetails")} />
      </details>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="reporterName">Your name</Label>
          <Input id="reporterName" autoComplete="name" aria-invalid={!!formState.errors.reporterName} {...register("reporterName")} />
          {formState.errors.reporterName ? <p className="text-sm text-destructive">{formState.errors.reporterName.message}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reporterEmail">Your email</Label>
          <Input id="reporterEmail" type="email" autoComplete="email" inputMode="email" aria-invalid={!!formState.errors.reporterEmail} {...register("reporterEmail")} />
          {formState.errors.reporterEmail ? <p className="text-sm text-destructive">{formState.errors.reporterEmail.message}</p> : null}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">We only use your email to send updates about this report. Staff handling the repair can see your name and email.</p>

      {serverError ? (
        <p role="alert" className="rounded-xl bg-[#fef2f2] p-3 text-sm text-[#dc2626]">
          {serverError}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="h-12 w-full text-[17px] font-semibold" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? (
          <>
            <Loader2 className="animate-spin" aria-hidden /> Analysing your report…
          </>
        ) : (
          "Send report"
        )}
      </Button>
    </form>
  );
}
