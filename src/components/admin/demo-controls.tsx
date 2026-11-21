"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, RotateCcw, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";

const ACTIONS = [
  { key: "reset", label: "Reset demo data", hint: "Deletes all demo records and re-seeds the fictional dataset.", Icon: RotateCcw, confirm: true },
  { key: "scenario-1", label: "1 · Duplicate detection", hint: "Three students report Washer #3 → one ticket, three linked reports.", Icon: Play },
  { key: "scenario-2", label: "2 · Safety escalation", hint: "“There is water near an electrical socket.” → critical, emergency alerts.", Icon: Play },
  { key: "scenario-2-timeout", label: "2b · Simulate missed acknowledgement", hint: "Moves the deadline into the past and runs the escalation job.", Icon: Timer },
  { key: "scenario-3", label: "3 · Resolution verification", hint: "Caretaker resolves Washer #3; two confirm, one says still broken → reopened.", Icon: Play },
  { key: "scenario-4", label: "4 · Predictive maintenance", hint: "Shows the Washer #1 replacement-review calculation (110.5%).", Icon: Play },
];

export function DemoControls() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [out, setOut] = useState<{ key: string; body: unknown } | null>(null);
  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-2">
        {ACTIONS.map((a) => (
          <div key={a.key} className="flex items-start justify-between gap-3 rounded-xl border p-3">
            <div>
              <p className="text-sm font-medium">{a.label}</p>
              <p className="text-xs text-muted-foreground">{a.hint}</p>
            </div>
            <Button
              size="sm"
              variant={a.key === "reset" ? "outline" : "default"}
              disabled={busy !== null}
              onClick={async () => {
                if (a.confirm && !confirm("Reset all demo data?")) return;
                setBusy(a.key);
                const res = await fetch(`/api/demo/${a.key}`, { method: "POST" });
                const body = await res.json().catch(() => ({}));
                setBusy(null);
                setOut({ key: a.key, body });
                if (res.ok) toast.success(`${a.label}: ${(body as { passed?: boolean }).passed === false ? "completed with unexpected result" : "done"}`);
                else toast.error(body.error ?? "Failed");
                router.refresh();
              }}
            >
              <a.Icon aria-hidden /> {busy === a.key ? "Running…" : "Run"}
            </Button>
          </div>
        ))}
      </div>
      {out ? (
        <details open className="rounded-xl bg-muted/50 p-3">
          <summary className="cursor-pointer text-xs font-medium">Result of “{out.key}” (from the real workflow services)</summary>
          <pre className="mt-2 max-h-80 overflow-auto text-xs">{JSON.stringify(out.body, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  );
}
