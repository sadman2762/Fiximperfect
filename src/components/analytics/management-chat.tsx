"use client";

import { useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AiModeBadge } from "@/components/shared/badges";

type Turn = { q: string; a: string; mode: string; tools: { tool: string; rows: number }[] };

const SUGGESTIONS = [
  "Which building has experienced the most plumbing problems this semester?",
  "Which appliances have generated the highest repair costs?",
  "Which assets should be considered for replacement?",
];

export function ManagementChat() {
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(question: string) {
    if (!question.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/analytics/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "The assistant is unavailable.");
    setTurns((t) => [...t, { q: question, a: body.answer, mode: body.mode, tools: body.tools }]);
    setQ("");
  }

  return (
    <section className="rounded-xl bg-card p-4 surface">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <MessageSquare className="size-4" aria-hidden /> Ask the management assistant
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">Answers are grounded in database records via read-only tools — no free-form SQL.</p>
      <div className="mt-3 space-y-3">
        {turns.map((t, i) => (
          <div key={i} className="space-y-1.5 text-sm">
            <p className="font-medium">{t.q}</p>
            <div className="rounded-xl bg-muted/50 p-3 whitespace-pre-line">{t.a}</div>
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <AiModeBadge mode={t.mode} /> Tools used: {t.tools.map((x) => `${x.tool} (${x.rows} rows)`).join(", ") || "none"}
            </p>
          </div>
        ))}
      </div>
      {!turns.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="border border-[#e1e5eb] bg-[#f7f9fc] px-3 py-1.5 text-left text-xs text-[#0b1f3a] hover:border-[#0071e3]/50 hover:bg-[#e8f2ff]" onClick={() => ask(s)} disabled={busy}>
              {s}
            </button>
          ))}
        </div>
      ) : null}
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about tickets, costs or assets…" maxLength={500} aria-label="Question" />
        <Button type="submit" disabled={busy || !q.trim()}>
          <Send aria-hidden /> {busy ? "Thinking…" : "Ask"}
        </Button>
      </form>
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
    </section>
  );
}
