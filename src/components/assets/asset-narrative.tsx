"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiModeBadge } from "@/components/shared/badges";

type Narrative = { mode: "live" | "mock"; pattern_summary: string; recommendation: string; caveats: string[] };

export function AssetNarrative({ assetId }: { assetId: string }) {
  const [n, setN] = useState<Narrative | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-3">
      {n ? (
        <div className="rounded-xl border p-3 text-sm">
          <div className="mb-1 flex items-center gap-2">
            <p className="font-medium">AI interpretation of the records above</p>
            <AiModeBadge mode={n.mode} />
          </div>
          <p>{n.pattern_summary}</p>
          <p className="mt-1">{n.recommendation}</p>
          {n.caveats.length ? <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">{n.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul> : null}
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const res = await fetch(`/api/assets/${assetId}/narrative`, { method: "POST" });
            const body = await res.json().catch(() => ({}));
            setBusy(false);
            if (res.ok) setN(body);
            else setError(body.error ?? "Could not generate an explanation.");
          }}
        >
          <Sparkles aria-hidden /> {busy ? "Interpreting records…" : "Explain this pattern"}
        </Button>
      )}
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

