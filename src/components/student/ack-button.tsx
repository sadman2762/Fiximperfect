"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function AckButton({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  if (state === "done") return <p className="mt-4 rounded-xl bg-[#e6f4f0] p-3 text-sm text-[#006b55]">Acknowledged. Escalation to backup contacts has stopped.</p>;
  return (
    <div className="mt-4">
      <Button
        size="lg"
        className="w-full"
        disabled={state === "sending"}
        onClick={async () => {
          setState("sending");
          const res = await fetch("/api/emergency/ack", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
          setState(res.ok ? "done" : "error");
        }}
      >
        I am responding — acknowledge alert
      </Button>
      {state === "error" ? <p className="mt-2 text-sm text-destructive">Could not acknowledge. Please try again or call the backup contact.</p> : null}
    </div>
  );
}

