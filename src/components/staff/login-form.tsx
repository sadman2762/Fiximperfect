"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppMark, Wordmark } from "@/components/shared/app-mark";
import { browserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

const DEMO_PASSWORD = "Demo-Fiximperfect-2026!";
const DEMO_ACCOUNTS = [
  { email: "caretaker@fiximperfect.example", label: "Caretaker" },
  { email: "admin@fiximperfect.example", label: "Administrator" },
  { email: "manager@fiximperfect.example", label: "Management" },
  { email: "appliance.tech@fiximperfect.example", label: "Technician" },
];

const POINTS = ["Every report triaged and routed by AI agents", "Emergencies escalated in seconds", "Repairs confirmed by the students who reported them"];

export function LoginForm({ showDemo }: { showDemo: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      {/* Brand panel */}
      <section className="navy relative hidden overflow-hidden p-12 lg:flex lg:flex-col">
        <div aria-hidden className="absolute -top-32 -right-24 size-[460px] rounded-full bg-[#0071e3]/25 blur-3xl" />
        <div aria-hidden className="absolute -bottom-40 -left-20 size-[420px] rounded-full bg-[#13294b] blur-2xl" />
        <Link href="/" className="relative flex items-center gap-2.5">
          <AppMark className="size-9 ring-white/20" />
          <Wordmark onDark className="text-[20px]" />
        </Link>
        <div className="relative mt-auto">
          <h2 className="text-[40px] leading-[1.08] font-bold tracking-[-0.035em] text-white">
            Maintenance that
            <br />
            coordinates itself.
          </h2>
          <ul className="mt-8 space-y-3">
            {POINTS.map((p) => (
              <li key={p} className="flex items-center gap-3 text-[15px] text-white/80">
                <CheckCircle2 className="size-5 text-[#ffd700]" aria-hidden /> {p}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Form */}
      <section className="flex items-center justify-center px-5 py-12">
        <div className="rise w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <AppMark className="size-9" />
            <Wordmark className="text-[20px]" />
          </div>
          <h1 className="text-[30px] font-bold tracking-[-0.03em]">Welcome back</h1>
          <p className="mt-1.5 text-[15px] text-[#5f6672]">Sign in to the staff workspace.</p>

          <form
            className="mt-8 space-y-4 p-6 surface"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              const { error } = await browserClient().auth.signInWithPassword({ email, password });
              if (error) {
                setBusy(false);
                return setError("That email and password don’t match. Check for a missing “!” or a trailing space.");
              }
              const next = new URLSearchParams(window.location.search).get("next");
              router.replace(next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") ? next : "/dashboard");
              router.refresh();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-[13px] text-[#0b1f3a]">
                Email
              </Label>
              <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value.trim())} placeholder="name@university.edu" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[13px] text-[#0b1f3a]">
                Password
              </Label>
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error ? (
              <p role="alert" className="rounded-xl border border-[#fbd5d5] bg-[#fef2f2] px-3 py-2 text-[13px] text-[#b91c1c]">
                {error}
              </p>
            ) : null}
            <Button type="submit" size="lg" className="w-full text-[15px] font-semibold" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {busy ? "Signing in…" : "Continue"}
              {!busy ? <ArrowRight aria-hidden /> : null}
            </Button>
          </form>

          {showDemo ? (
            <div className="mt-6 panel-blue p-4">
              <p className="text-[13px] font-semibold text-[#0b1f3a]">Demo accounts — tap to fill in</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {DEMO_ACCOUNTS.map((a) => (
                  <button
                    key={a.email}
                    type="button"
                    onClick={() => {
                      setEmail(a.email);
                      setPassword(DEMO_PASSWORD);
                      setError(null);
                    }}
                    className={cn(
                      "rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                      email === a.email ? "border-[#0071e3] bg-[#0071e3] text-white" : "border-[#d3e5fb] bg-white text-[#0b1f3a] hover:border-[#0071e3]/50",
                    )}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-[#5f6672]">
                Password <code className="rounded bg-white px-1.5 py-0.5 text-[#0b1f3a]">{DEMO_PASSWORD}</code>
              </p>
            </div>
          ) : null}

          <p className="mt-8 text-[13px] text-[#5f6672]">
            Students don’t need an account.{" "}
            <Link href="/#qr" className="font-medium text-[#0071e3] hover:text-[#005bb5]">
              Scan a code to report a problem
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
