"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppMark } from "@/components/shared/app-mark";
import { browserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

const DEMO_PASSWORD = "Demo-Fiximperfect-2026!";
const DEMO_ACCOUNTS = [
  { email: "caretaker@fiximperfect.example", label: "Caretaker" },
  { email: "admin@fiximperfect.example", label: "Administrator" },
  { email: "manager@fiximperfect.example", label: "Management" },
  { email: "appliance.tech@fiximperfect.example", label: "Technician" },
];

export function LoginForm({ showDemo }: { showDemo: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-background px-5 py-12">
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(0,113,227,0.16),transparent)]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-48 left-1/4 h-[420px] w-[620px] rounded-full bg-[radial-gradient(closest-side,rgba(94,92,230,0.12),transparent)]" />
      <div className="rise relative w-full max-w-[400px]">
        <div className="text-center">
          <AppMark className="mx-auto size-16" />
          <h1 className="mt-6 text-[28px] font-bold tracking-[-0.03em]">Sign in to Fiximperfect</h1>
          <p className="mt-1.5 text-[15px] text-muted-foreground">For caretakers, maintenance teams and management.</p>
        </div>

        <form
          className="glass mt-8 space-y-4 rounded-[28px] p-6 surface"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const { error } = await browserClient().auth.signInWithPassword({ email, password });
            if (error) {
              setBusy(false);
              return setError("That email and password don’t match. Check for a missing “!” or a trailing space.");
            }
            // Return to the page that required sign-in (same-origin paths only).
            const next = new URLSearchParams(window.location.search).get("next");
            router.replace(next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") ? next : "/dashboard");
            router.refresh();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-[13px]">
              Email
            </Label>
            <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value.trim())} placeholder="name@university.edu" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-[13px]">
              Password
            </Label>
            <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error ? (
            <p role="alert" className="rounded-xl bg-[#fff1f0] px-3 py-2 text-[13px] text-[#d70015]">
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
          <div className="mt-6 text-center">
            <p className="text-[13px] text-muted-foreground">Demo accounts — tap to fill in</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
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
                    "rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                    email === a.email ? "bg-primary text-white" : "bg-white text-foreground surface hover:bg-[#f5f5f7]",
                  )}
                >
                  {a.label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Password <code className="rounded bg-black/5 px-1 py-0.5">{DEMO_PASSWORD}</code>
            </p>
          </div>
        ) : null}

        <p className="mt-8 text-center text-[13px] text-muted-foreground">
          Students don’t need an account.{" "}
          <Link href="/#qr" className="text-primary hover:underline">
            Scan a code to report a problem
          </Link>
        </p>
      </div>
    </main>
  );
}
