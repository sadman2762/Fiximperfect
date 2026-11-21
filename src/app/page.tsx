import Link from "next/link";
import QRCode from "qrcode";
import { ArrowRight, BarChart3, BadgeCheck, Copy, MapPin, QrCode, ShieldAlert, Siren, Sparkles, Check } from "lucide-react";
import { appUrl } from "@/lib/env";
import { buttonVariants } from "@/components/ui/button";
import { AppMark, Wordmark } from "@/components/shared/app-mark";
import { STEP_COLORS, PROGRESS_STEPS } from "@/lib/tickets/progress";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const DEMO_QR = [
  { slug: "kossuth-b-floor2-laundry", title: "Laundry Room", where: "Kossuth Dorm B · Floor 2", kind: "Shared space", code: "KOS-B-F2-LAUNDRY" },
  { slug: "kossuth-b-room-204", title: "Room 204", where: "Kossuth Dorm B · Floor 2", kind: "Room", code: "KOS-B-R204" },
  { slug: "kossuth-b-floor1-corridor", title: "Corridor East", where: "Kossuth Dorm B · Floor 1", kind: "Shared space", code: "KOS-B-F1-CORRIDOR" },
];

const STEPS = [
  { n: "1", title: "Scan", text: "One QR sticker per room tells us exactly where you are. Nothing to fill in." },
  { n: "2", title: "Describe", text: "A sentence and a photo. Claude reads both, classifies the fault and checks for danger." },
  { n: "3", title: "Coordinate", text: "Duplicates merge into one ticket, emergencies jump the queue, the right team is assigned." },
  { n: "4", title: "Verify", text: "When it’s marked fixed, you confirm it. If it isn’t, the ticket reopens on its own." },
];

const CAPABILITIES = [
  { value: "4", label: "Specialist AI agents" },
  { value: "0", label: "Location fields to fill in" },
  { value: "5", label: "Visible progress steps" },
  { value: "1", label: "Ticket per real problem" },
];

const FEATURES = [
  { Icon: QrCode, tint: "bg-[#e8f2ff] text-[#0071e3]", title: "Report in under a minute", text: "Every room and shared space carries one QR code. The location is resolved on the server — students just say what’s wrong, in their own words.", wide: true },
  { Icon: Copy, tint: "bg-[#eef2ff] text-[#4338ca]", title: "One problem, one ticket", text: "Three students, three wordings, one broken washer. Reports link to a single ticket — everyone still gets their own updates." },
  { Icon: ShieldAlert, tint: "bg-[#fef2f2] text-[#dc2626]", title: "Danger jumps the queue", text: "Deterministic safety rules plus AI. Critical hazards alert caretakers by SMS, call and e-mail — and escalate if nobody answers." },
  { Icon: BadgeCheck, tint: "bg-[#f0fdf4] text-[#16a34a]", title: "Fixed means fixed", text: "Every reporter confirms the repair. A single “still broken” reopens the ticket, history intact." },
  { Icon: BarChart3, tint: "bg-[#fff7ed] text-[#d97706]", title: "Know what to replace", text: "Failure frequency and repair spend versus replacement cost — with the tickets and invoices behind every recommendation." },
];

function PhoneMock() {
  const current = 1;
  return (
    <div className="relative mx-auto w-[320px] sm:w-[340px]">
      <div className="rounded-[52px] bg-[#0b1f3a] p-[9px] shadow-[0_50px_100px_-40px_rgba(11,31,58,0.6)]">
        <div className="overflow-hidden rounded-[44px] bg-[#f5f5f7]">
          <div className="navy flex items-center justify-between px-6 pt-3 pb-3">
            <span className="text-[13px] font-bold">
              Fiximperfect<span className="text-[#ffd700]">.</span>
            </span>
            <span className="h-[22px] w-[78px] rounded-full bg-black/70" />
            <span className="w-[60px]" />
          </div>
          <div className="space-y-3 px-4 pt-4 pb-6 text-left">
            <div className="rounded-2xl bg-[#e8f2ff] p-4">
              <p className="text-center text-[10px] font-bold tracking-[0.08em] text-[#0b1f3a] uppercase">Your report has been assigned</p>
              <ol className="mt-4 flex">
                {PROGRESS_STEPS.map((s, i) => {
                  const col = STEP_COLORS[s.key];
                  return (
                    <li key={s.key} className="relative flex flex-1 flex-col items-center">
                      {i > 0 ? <span className="absolute top-[11px] right-1/2 left-0 h-[2px]" style={{ background: i <= current ? col : "#c7c7cc" }} /> : null}
                      {i < PROGRESS_STEPS.length - 1 ? <span className="absolute top-[11px] right-0 left-1/2 h-[2px]" style={{ background: i < current ? STEP_COLORS[PROGRESS_STEPS[i + 1].key] : "#c7c7cc" }} /> : null}
                      <span className="relative grid h-[22px] place-items-center">
                        {i < current ? (
                          <span className="grid size-[22px] place-items-center rounded-full text-white" style={{ background: col }}>
                            <Check className="size-3" strokeWidth={3.2} aria-hidden />
                          </span>
                        ) : i === current ? (
                          <span className="grid size-6 place-items-center rounded-full border-[3px] bg-white" style={{ borderColor: col }}>
                            <span className="size-2 rounded-full" style={{ background: col }} />
                          </span>
                        ) : (
                          <span className="size-2.5 rounded-full border-2 border-[#c7c7cc] bg-white" />
                        )}
                      </span>
                      <span className={cn("mt-1.5 text-center text-[9px] leading-tight", i <= current ? "font-medium text-[#0b1f3a]" : "text-[#8a929e]")}>{s.label}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
            <div className="rounded-2xl border border-[#e1e5eb] bg-white p-3.5">
              <p className="text-[10px] font-medium text-[#5f6672]">Your report</p>
              <p className="mt-1 text-[14px] leading-snug font-medium text-[#0b1f3a]">“The laundry machine door latch seems damaged.”</p>
              <p className="mt-2 flex items-center gap-1 text-[11px] text-[#5f6672]">
                <MapPin className="size-3" aria-hidden /> Kossuth Dorm B · Floor 2 · Laundry Room
              </p>
            </div>
            <div className="rounded-2xl border border-[#e1e5eb] bg-white p-3.5">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold text-[#0071e3]">
                <Sparkles className="size-3" aria-hidden /> AI coordination
              </p>
              <ul className="mt-2 space-y-1.5 text-[12px]">
                {[
                  ["Category", "Laundry · 92%"],
                  ["Ticket", "MNT-017 · 3 reports"],
                  ["Team", "Appliance Maintenance"],
                ].map(([k, v]) => (
                  <li key={k} className="flex justify-between gap-2">
                    <span className="text-[#5f6672]">{k}</span>
                    <span className="text-right font-medium text-[#0b1f3a]">{v}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl bg-[#0071e3] py-3 text-center text-[13px] font-semibold text-white">Track my report</div>
          </div>
        </div>
      </div>
      <div className="absolute top-28 right-full mr-10 hidden w-64 -rotate-2 p-3.5 text-left surface lg:block">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#dc2626]">
          <span className="pulse-critical size-1.5 rounded-full bg-[#dc2626]" /> Safety alert · now
        </p>
        <p className="mt-1.5 text-[13px] leading-snug font-medium text-[#0b1f3a]">Water near an electrical socket — caretaker alerted by SMS & call.</p>
      </div>
      <div className="absolute bottom-28 left-full ml-10 hidden w-64 rotate-2 p-3.5 text-left surface lg:block">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#5f6672]">
          <BarChart3 className="size-3.5" aria-hidden /> Asset insight
        </p>
        <p className="mt-1.5 text-[13px] leading-snug font-medium text-[#0b1f3a]">Washer #1 · 4 failures in 60 days</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#f1f3f6]">
          <div className="h-full w-full rounded-full bg-gradient-to-r from-[#d97706] to-[#dc2626]" />
        </div>
        <p className="mt-1 text-[11px] text-[#5f6672]">Repairs at 110.5% of replacement cost</p>
      </div>
    </div>
  );
}

export default async function Home() {
  const codes = await Promise.all(DEMO_QR.map((q) => QRCode.toString(appUrl(`/report/${q.slug}`), { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0b1f3a", light: "#ffffff" } })));
  return (
    <div className="min-h-dvh overflow-x-hidden bg-[#f5f5f7]">
      <header className="navy sticky top-0 z-40">
        <div className="mx-auto flex h-16 max-w-[1120px] items-center gap-8 px-5 text-[14px]">
          <Link href="/" className="flex items-center gap-2.5">
            <AppMark className="size-8 ring-white/20" />
            <Wordmark onDark className="text-[19px]" />
          </Link>
          <nav className="hidden gap-7 text-white/70 sm:flex" aria-label="Sections">
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#how" className="hover:text-white">How it works</a>
            <a href="#qr" className="hover:text-white">Try it</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/emergency" className={cn(buttonVariants({ size: "sm" }), "bg-[#dc2626] hover:bg-[#b91c1c]")}>
              <Siren aria-hidden /> Emergency
            </Link>
            <Link href="/login" className={cn(buttonVariants({ size: "sm", variant: "outline" }), "hidden sm:inline-flex")}>
              Staff sign in
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative isolate bg-gradient-to-b from-white via-white to-[#e8f2ff] px-5 pt-20 pb-24 text-center sm:pt-24">
          <span className="rise inline-flex items-center gap-2 rounded-full border border-[#d3e5fb] bg-[#e8f2ff] px-3.5 py-1 text-[13px] font-medium text-[#0b1f3a]">
            <span className="size-1.5 rounded-full bg-[#0071e3]" /> AI-coordinated dormitory maintenance
          </span>
          <h1 className="rise rise-1 title-xl mx-auto mt-6 max-w-4xl">
            Broken things,
            <br />
            <span className="text-gradient">sorted by themselves.</span>
          </h1>
          <p className="rise rise-2 mx-auto mt-6 max-w-2xl text-[18px] leading-relaxed text-[#454b55]">
            Scan a code, say what’s wrong. AI agents triage it, spot emergencies, merge duplicates and route it to the right team — then check with you that it’s really fixed.
          </p>
          <div className="rise rise-3 mt-9 flex flex-wrap items-center justify-center gap-3">
            <a href="#qr" className={cn(buttonVariants({ size: "lg" }), "h-12 px-7 text-[15px]")}>
              Report a problem
            </a>
            <Link href="/emergency" className={cn(buttonVariants({ size: "lg" }), "h-12 bg-[#dc2626] px-7 text-[15px] shadow-[0_6px_16px_-8px_rgba(220,38,38,0.8)] hover:bg-[#b91c1c]")}>
              <Siren aria-hidden /> Report an emergency
            </Link>
            <Link href="/login" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-12 px-7 text-[15px]")}>
              Open the staff app <ArrowRight aria-hidden />
            </Link>
          </div>
          <div className="rise rise-3 mt-16">
            <PhoneMock />
          </div>
        </section>

        <section aria-label="Capabilities" className="px-5">
          <dl className="mx-auto -mt-10 grid max-w-[1000px] grid-cols-2 gap-3 md:grid-cols-4">
            {CAPABILITIES.map((c) => (
              <div key={c.label} className="relative px-6 py-6 text-center surface">
                <dd className="text-[40px] leading-none font-bold tracking-[-0.04em] text-[#0b1f3a]">{c.value}</dd>
                <dt className="mt-2 text-[13px] text-[#5f6672]">{c.label}</dt>
              </div>
            ))}
          </dl>
        </section>

        <section id="features" className="scroll-mt-20 px-5 py-24">
          <div className="mx-auto max-w-[1120px]">
            <p className="eyebrow">Features</p>
            <h2 className="title-lg mt-3 max-w-2xl">Everything a maintenance team needs. Nothing a student has to learn.</h2>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {FEATURES.map((f) => (
                <article key={f.title} className={cn("surface surface-hover p-7", f.wide && "md:col-span-2")}>
                  <span className={cn("grid size-12 place-items-center rounded-xl", f.tint)}>
                    <f.Icon className="size-6" strokeWidth={1.8} aria-hidden />
                  </span>
                  <h3 className="mt-6 text-[20px] leading-tight font-semibold">{f.title}</h3>
                  <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-[#454b55]">{f.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="scroll-mt-20 bg-[#e8f2ff] px-5 py-24">
          <div className="mx-auto max-w-[1120px]">
            <p className="eyebrow">How it works</p>
            <h2 className="title-lg mt-3">Four steps. About a minute.</h2>
            <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s) => (
                <li key={s.n} className="p-6 surface">
                  <span className="grid size-10 place-items-center rounded-full bg-[#0b1f3a] text-[15px] font-bold text-white">{s.n}</span>
                  <h3 className="mt-5 text-[19px] font-semibold">{s.title}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-[#454b55]">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="qr" className="scroll-mt-16 px-5 py-24">
          <div className="mx-auto max-w-[1120px] text-center">
            <p className="eyebrow">Try it now</p>
            <h2 className="title-lg mt-3">Pick a code. Be the student.</h2>
            <p className="mx-auto mt-3 max-w-xl text-[17px] text-[#454b55]">These are the stickers on the doors — one per room or shared space. Tap one to open the reporting page — no sign-in, no app.</p>
            <ul className="mt-12 grid gap-5 sm:grid-cols-3">
              {DEMO_QR.map((q, i) => (
                <li key={q.slug}>
                  <Link href={`/report/${q.slug}`} className="group surface surface-hover block p-7 focus-visible:ring-4 focus-visible:ring-[#0071e3]/25 focus-visible:outline-none">
                    <div className="relative mx-auto w-40 overflow-hidden rounded-xl border border-[#e1e5eb] bg-white p-3.5">
                      <div aria-hidden dangerouslySetInnerHTML={{ __html: codes[i] }} />
                      <span aria-hidden className="scanline pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-transparent via-[#0071e3]/20 to-transparent" />
                    </div>
                    <p className="mt-6 text-[12px] font-semibold tracking-[0.06em] text-[#0071e3] uppercase">{q.kind}</p>
                    <p className="mt-1 text-[20px] font-semibold text-[#0b1f3a]">{q.title}</p>
                    <p className="text-[13px] text-[#5f6672]">{q.where}</p>
                    <p className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-medium text-[#0071e3] group-hover:text-[#005bb5]">
                      Open report page <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-10 text-xs text-[#5f6672]">
              Codes point to {appUrl()} · all codes are in{" "}
              <Link href="/admin?tab=qr" className="underline hover:text-[#0b1f3a]">
                Settings → QR codes
              </Link>{" "}
              (staff)
            </p>
          </div>
        </section>
      </main>

      <footer className="navy px-5 py-10">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-4 text-[13px] text-white/60">
          <span className="flex items-center gap-2">
            <AppMark className="size-6 ring-white/20" />
            <Wordmark onDark className="text-[15px]" />
          </span>
          <span>Dormitory maintenance · Demo data is fictional</span>
        </div>
      </footer>
    </div>
  );
}
