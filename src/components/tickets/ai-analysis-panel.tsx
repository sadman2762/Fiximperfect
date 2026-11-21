import { Bot, Copy, Gauge, Route, ShieldCheck, Eye } from "lucide-react";
import { AiModeBadge, PriorityBadge } from "@/components/shared/badges";
import { HAZARD_LABEL, type HazardCode } from "@/lib/safety/rules";

/* Renders the stored, validated agent outputs for one report. */
type Analysis = {
  mode?: string;
  model?: string | null;
  seeded?: boolean;
  note?: string;
  classification?: {
    category: string; subcategory: string; issue: string; confidence: number; image_assessment: string;
    visual_evidence: string[]; inferred_causes: string[]; summary: string; asset_code: string | null;
  } | null;
  safety?: {
    safety_level: string; detected_hazards: string[]; reason: string; decided_by: string; rule_level: string; ai_level: string | null;
  };
  duplicate?: {
    assessment: { is_duplicate: boolean; matched_ticket: string | null; confidence: number; reason: string } | null;
    decision: string; candidates: string[]; thresholds: { autoLink: number; review: number };
  };
  triage?: { priority: "low" | "medium" | "high" | "critical"; priority_reason: string; recommended_team: string; assignment_reason: string } | null;
  routing?: { teamName: string | null; reason: string; source: string };
  degraded?: string[];
};

function Confidence({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1 w-20 overflow-hidden bg-white/10" aria-hidden>
        <span className="block h-full bg-[#00866a]" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-xs tabular-nums">{pct}%</span>
    </span>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof Bot; title: string; children: React.ReactNode }) {
  return (
    <div className="border border-[#dde2e5] bg-[#f8fafa] p-3.5">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <Icon className="size-3.5" aria-hidden /> {title}
      </p>
      <div className="space-y-1.5 text-sm">{children}</div>
    </div>
  );
}

const DECIDED: Record<string, string> = {
  rules: "Deterministic safety rules",
  ai: "AI assessment (raised above rules)",
  rules_and_ai: "Rules and AI agree",
  none: "No hazard found by rules or AI",
};

export function AiAnalysisPanel({ analysis }: { analysis: Analysis | null }) {
  if (!analysis) return <p className="text-sm text-muted-foreground">Analysis pending.</p>;
  if (analysis.seeded) return <p className="text-sm text-muted-foreground">Seeded demo history — no AI analysis was run for this record.</p>;
  const c = analysis.classification;
  const s = analysis.safety;
  const d = analysis.duplicate;
  const t = analysis.triage;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <AiModeBadge mode={analysis.mode} />
        {analysis.model ? <span className="text-xs text-muted-foreground">Model: {analysis.model}</span> : null}
      </div>
      {analysis.degraded?.length ? (
        <p className="rounded-xl bg-[#fff7ed] p-2 text-xs text-[#b45309]">Fallbacks used: {analysis.degraded.join("; ")}</p>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        <Section icon={Eye} title="Vision & classification">
          {c ? (
            <>
              <p>
                <strong>{c.category}</strong> · {c.subcategory} — {c.issue}
              </p>
              <p className="flex items-center gap-2 text-muted-foreground">
                Confidence <Confidence value={c.confidence} />
              </p>
              <p className="text-muted-foreground">Photo: {c.image_assessment.replace(/_/g, " ")}</p>
              {c.visual_evidence.length ? (
                <div>
                  <p className="text-xs font-medium">Observed in photo</p>
                  <ul className="list-disc pl-5 text-xs">{c.visual_evidence.map((v, i) => <li key={i}>{v}</li>)}</ul>
                </div>
              ) : null}
              {c.inferred_causes.length ? (
                <div>
                  <p className="text-xs font-medium">Possible causes (inferred, not observed)</p>
                  <ul className="list-disc pl-5 text-xs">{c.inferred_causes.map((v, i) => <li key={i}>{v}</li>)}</ul>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-muted-foreground">Classification unavailable — sent to human review.</p>
          )}
        </Section>
        <Section icon={ShieldCheck} title="Safety assessment">
          {s ? (
            <>
              <p>
                Level: <strong className={s.safety_level === "critical" ? "text-[#dc2626]" : ""}>{s.safety_level}</strong>
              </p>
              <p className="text-xs text-muted-foreground">
                Decided by: {DECIDED[s.decided_by] ?? s.decided_by} (rules: {s.rule_level}, AI: {s.ai_level ?? "n/a"})
              </p>
              {s.detected_hazards.length ? (
                <ul className="list-disc pl-5 text-xs">{s.detected_hazards.map((h) => <li key={h}>{HAZARD_LABEL[h as HazardCode] ?? h}</li>)}</ul>
              ) : null}
              <p className="text-xs">{s.reason}</p>
            </>
          ) : null}
        </Section>
        <Section icon={Copy} title="Duplicate detection">
          {d ? (
            <>
              <p>
                Decision: <strong>{d.decision === "link" ? "linked to existing ticket" : d.decision === "review" ? "flagged for caretaker review" : "new ticket"}</strong>
              </p>
              {d.assessment ? (
                <>
                  {d.assessment.matched_ticket ? (
                    <p className="flex items-center gap-2 text-muted-foreground">
                      Best match {d.assessment.matched_ticket} <Confidence value={d.assessment.confidence} />
                    </p>
                  ) : null}
                  <p className="text-xs">{d.assessment.reason}</p>
                </>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Candidates compared: {d.candidates.length ? d.candidates.join(", ") : "none"} · thresholds: auto-link ≥ {Math.round(d.thresholds.autoLink * 100)}%, review ≥{" "}
                {Math.round(d.thresholds.review * 100)}%
              </p>
            </>
          ) : null}
        </Section>
        <Section icon={Route} title="Triage & routing">
          {t ? (
            <>
              <p className="flex items-center gap-2">
                Recommended priority <PriorityBadge priority={t.priority} />
              </p>
              <p className="text-xs">{t.priority_reason}</p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">AI triage unavailable — category defaults applied.</p>
          )}
          {analysis.routing ? (
            <>
              <p className="flex items-center gap-1.5">
                <Gauge className="size-3.5" aria-hidden /> Team: <strong>{analysis.routing.teamName ?? "Manual review"}</strong>
              </p>
              <p className="text-xs text-muted-foreground">
                {analysis.routing.source === "ai_validated" ? "AI recommendation validated against team directory" : analysis.routing.source === "rule" ? "Database routing rule" : "No team matched"} — {analysis.routing.reason}
              </p>
            </>
          ) : null}
        </Section>
      </div>
    </div>
  );
}

