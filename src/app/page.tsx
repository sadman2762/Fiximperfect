import Link from "next/link";
import QRCode from "qrcode";
import { ArrowRight, BarChart3, BadgeCheck, Copy, MapPin, QrCode, ShieldAlert, Sparkles } from "lucide-react";
import { appUrl } from "@/lib/env";
import { buttonVariants } from "@/components/ui/button";
import { AppMark } from "@/components/shared/app-mark";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const DEMO_QR = [
  { slug: "kossuth-b-floor2-washer03", title: "Washer #3", where: "Kossuth Dorm B · Floor 2", kind: "Asset code" },
  { slug: "kossuth-b-floor1-corridor", title: "Corridor East", where: "Kossuth Dorm B · Floor 1", kind: "Location code" },
  { slug: "kossuth-b-floor2-kitchen", title: "Shared Kitchen", where: "Kossuth Dorm B · Floor 2", kind: "Location code" },
];

const STEPS = [
  { n: "1", title: "Scan", text: "A QR sticker on the machine tells us exactly where you are. Nothing to fill in." },
  { n: "2", title: "Describe", text: "A sentence and a photo. Claude reads both, classifies the fault and checks for danger." },
  { n: "3", title: "Coordinate", text: "Duplicates merge into one ticket, emergencies jump the queue, the right team is assigned." },
  { n: "4", title: "Verify", text: "When it’s marked fixed, you confirm it. If it isn’t, the ticket reopens on its own." },
];

function PhoneMock() {
  return (
    <div className="relative mx-auto w-[320px] sm:w-[340px]">
      <div className="rounded-[48px] bg-[#1d1d1f] p-[10px] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.45)]">
        <div className="overflow-hidden rounded-[38px] bg-[#f5f5f7]">
          <div className="flex justify-center pt-2.5 pb-1">
            <span className="h-[26px] w-[92px] rounded-full bg-[#1d1d1f]" />
          </div>
          <div className="space-y-2.5 px-4 pt-3 pb-6 text-left">
            <p className="text-[11px] font-semibold tracking-wide text-[#6e6e73] uppercase">Report received</p>
            <div className="rounded-2xl bg-white p-3.5 surface">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-full bg-[#34c759] text-white">
                  <BadgeCheck className="size-4.5" aria-hidden />
                </span>
                <div>
                  <p className="text-[15px] font-semibold tracking-tight">Washer #3</p>
                  <p className="flex items-center gap-1 text-[11px] text-[#6e6e73]">
                    <MapPin className="size-3" aria-hidden /> Kossuth Dorm B · Floor 2
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[13px] leading-snug">“The laundry machine door latch seems damaged.”</p>
            </div>
            <div className="rounded-2xl bg-white p-3.5 surface">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#0071e3]">
                <Sparkles className="size-3.5" aria-hidden /> What happened next
              </p>
              <ul className="mt-2 space-y-2 text-[12.5px]">
                <li className="flex justify-between gap-2">
                  <span className="text-[#6e6e73]">Category</span>
                  <span className="text-right font-medium">Laundry · 92%</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span className="text-[#6e6e73]">Ticket</span>
                  <span className="text-right font-medium">MNT-017 · 3 reports</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span className="text-[#6e6e73]">Team</span>
                  <span className="text-right font-medium">Appliance team</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span className="text-[#6e6e73]">Status</span>
                  <span className="rounded-full bg-[#e8f2ff] px-2 py-px font-medium text-[#0071e3]">Assigned</span>
                </li>
              </ul>
            </div>
            <div className="rounded-2xl bg-[#0071e3] p-3 text-center text-[13px] font-semibold text-white">Track my report</div>
          </div>
        </div>
      </div>
      {/* Floating notifications */}
      <div className="glass absolute top-28 right-full mr-10 hidden w-64 -rotate-2 rounded-2xl p-3.5 text-left surface lg:block">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#d70015]">
          <ShieldAlert className="size-3.5" aria-hidden /> SAFETY ALERT · NOW
        </p>
        <p className="mt-1 text-[13px] leading-snug font-medium">Water near an electrical socket — caretaker called.</p>
      </div>
      <div className="glass absolute bottom-28 left-full ml-10 hidden w-64 rotate-2 rounded-2xl p-3.5 text-left surface lg:block">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#6e6e73]">
          <BarChart3 className="size-3.5" aria-hidden /> ASSET INSIGHT
        </p>
        <p className="mt-1 text-[13px] leading-snug font-medium">Washer #1 · 4 failures in 60 days.</p>
        <p className="text-[12px] text-[#6e6e73]">Repairs at 110.5% of replacement cost.</p>
      </div>
    </div>
  );
}

const FEATURES = [
  {
    Icon: QrCode,
    tint: "from-[#2997ff] to-[#0071e3]",
    title: "Report in under a minute.",
    text: "Every machine and room has its own QR code. Location and equipment are resolved on our server, so students only describe the problem.",
    wide: true,
  },
  { Icon: Copy, tint: "from-[#5e5ce6] to-[#7d7aff]", title: "One problem. One ticket.", text: "Three students, three wordings, one broken washer. Reports link to a single ticket — and everyone still gets their own updates." },
  { Icon: ShieldAlert, tint: "from-[#ff453a] to-[#d70015]", title: "Danger jumps the queue.", text: "Deterministic safety rules plus AI. Critical hazards alert caretakers by SMS, call and email — and escalate if nobody answers." },
  { Icon: BadgeCheck, tint: "from-[#30d158] to-[#248a3d]", title: "Fixed means fixed.", text: "Every reporter confirms the repair. A single “still broken” reopens the ticket, with its full history intact." },
  {
    Icon: BarChart3,
    tint: "from-[#ff9f0a] to-[#c93400]",
    title: "Know what to replace.",
    text: "Failure frequency and repair spend versus replacement cost — with the tickets and invoices behind every recommendation.",
  },
];

export default async function Home() {
  const codes = await Promise.all(DEMO_QR.map((q) => QRCode.toString(appUrl(`/report/${q.slug}`), { type: "svg", margin: 0, errorCorrectionLevel: "M" })));
  return (
    <div className="min-h-dvh overflow-x-hidden bg-background">
      <header className="glass sticky top-0 z-40 border-b border-black/[0.06]">
        <div className="mx-auto flex h-12 max-w-[1080px] items-center gap-6 px-5 text-[13px]">
          <Link href="/" className="flex items-center gap-2">
            <AppMark className="size-6" />
            <span className="text-[15px] font-semibold tracking-tight">Fiximperfect</span>
          </Link>
          <nav className="hidden gap-6 text-[#424245] sm:flex" aria-label="Sections">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#qr" className="hover:text-foreground">Try it</a>
          </nav>
          <Link href="/login" className={cn(buttonVariants({ size: "sm" }), "ml-auto")}>
            Staff sign in
          </Link>
        </div>
      </header>

      <main>
        <section className="relative px-5 pt-16 pb-20 text-center sm:pt-24">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[620px] bg-[radial-gradient(60%_50%_at_50%_0%,rgba(0,113,227,0.12),transparent_70%)]" />
          <div className="relative">
            <p className="rise eyebrow">Dormitory maintenance, reimagined</p>
            <h1 className="rise rise-1 title-xl mx-auto mt-4 max-w-4xl">
              Broken things,
              <br />
              <span className="text-gradient">sorted by themselves.</span>
            </h1>
            <p className="rise rise-2 mx-auto mt-6 max-w-2xl text-[19px] leading-relaxed text-[#6e6e73]">
              Scan a code, say what’s wrong. AI agents triage it, spot emergencies, merge duplicates and route it to the right team — then check with you that it’s really fixed.
            </p>
            <div className="rise rise-3 mt-9 flex flex-wrap items-center justify-center gap-4">
              <a href="#qr" className={buttonVariants({ size: "lg" })}>
                Report a problem
              </a>
              <Link href="/login" className="inline-flex items-center gap-1 text-[15px] font-medium text-primary hover:underline">
                Open the staff app <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
            <div className="rise rise-3 mt-16">
              <PhoneMock />
            </div>
          </div>
        </section>

        <section id="features" className="scroll-mt-16 px-5 pb-24">
          <div className="mx-auto max-w-[1080px]">
            <h2 className="title-lg max-w-xl">Everything a maintenance team needs. Nothing a student has to learn.</h2>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {FEATURES.map((f) => (
                <article key={f.title} className={cn("surface-hover rounded-[28px] bg-white p-7 surface", f.wide && "md:col-span-2")}>
                  <span className={cn("grid size-12 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-sm", f.tint)}>
                    <f.Icon className="size-6" aria-hidden />
                  </span>
                  <h3 className="mt-6 text-[22px] leading-tight font-semibold">{f.title}</h3>
                  <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-[#6e6e73]">{f.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="scroll-mt-16 bg-white px-5 py-24">
          <div className="mx-auto max-w-[1080px]">
            <p className="eyebrow">How it works</p>
            <h2 className="title-lg mt-3">Four steps. About a minute.</h2>
            <ol className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s) => (
                <li key={s.n}>
                  <span className="text-[56px] leading-none font-bold tracking-[-0.05em] text-[#d2d2d7]">{s.n}</span>
                  <h3 className="mt-3 text-[19px] font-semibold">{s.title}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-[#6e6e73]">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="qr" className="scroll-mt-12 bg-[#1d1d1f] px-5 py-24 text-white">
          <div className="mx-auto max-w-[1080px] text-center">
            <p className="text-xs font-semibold tracking-[0.06em] text-[#86868b] uppercase">Try it now</p>
            <h2 className="title-lg mt-3">Pick a code. Be the student.</h2>
            <p className="mx-auto mt-3 max-w-xl text-[17px] text-[#a1a1a6]">These are the stickers on the equipment. Tap one to open the reporting page — no sign-in, no app.</p>
            <ul className="mt-12 grid gap-5 sm:grid-cols-3">
              {DEMO_QR.map((q, i) => (
                <li key={q.slug}>
                  <Link
                    href={`/report/${q.slug}`}
                    className="group block rounded-[28px] bg-[#2c2c2e] p-6 transition-colors hover:bg-[#3a3a3c] focus-visible:ring-4 focus-visible:ring-[#2997ff]/50 focus-visible:outline-none"
                  >
                    <div className="mx-auto w-40 rounded-2xl bg-white p-3.5">
                      <div aria-hidden dangerouslySetInnerHTML={{ __html: codes[i] }} />
                    </div>
                    <p className="mt-5 text-[11px] font-semibold tracking-[0.06em] text-[#86868b] uppercase">{q.kind}</p>
                    <p className="mt-1 text-[19px] font-semibold">{q.title}</p>
                    <p className="text-[13px] text-[#a1a1a6]">{q.where}</p>
                    <p className="mt-4 inline-flex items-center gap-1 text-[14px] font-medium text-[#2997ff] group-hover:underline">
                      Open report page <ArrowRight className="size-3.5" aria-hidden />
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-8 text-xs text-[#86868b]">
              Codes point to {appUrl()} · all codes are in{" "}
              <Link href="/admin?tab=qr" className="underline hover:text-white">
                Settings → QR codes
              </Link>{" "}
              (staff)
            </p>
          </div>
        </section>
      </main>

      <footer className="px-5 py-8 text-center text-xs text-[#86868b]">Fiximperfect · Demo data is fictional</footer>
    </div>
  );
}
