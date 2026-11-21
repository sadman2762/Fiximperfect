"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function HistoryRequestForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("sending");
        const res = await fetch("/api/track/history", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
        const body = await res.json().catch(() => ({}));
        setState(res.ok ? "sent" : "error");
        setMessage(res.ok ? body.message : (body.error ?? "Something went wrong."));
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="email">Email address</Label>
        <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </div>
      <Button type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : "Email me a link"}
      </Button>
      {message ? (
        <p role="status" className={state === "error" ? "text-sm text-destructive" : "text-sm text-[#15803d]"}>
          {message}
        </p>
      ) : null}
    </form>
  );
}
