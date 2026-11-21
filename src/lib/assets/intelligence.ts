import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { aiConfig } from "@/lib/env";
import { callStructured } from "@/lib/ai/client";

export interface AssetStats {
  asset_id: string;
  asset_code: string;
  asset_name: string;
  category: string;
  building_id: string;
  building_name: string;
  location_name: string;
  floor: number;
  installation_date: string | null;
  age_years: number | null;
  expected_useful_life_years: number | null;
  currency: string;
  replacement_cost: number | null;
  failures_30d: number;
  failures_60d: number;
  failures_90d: number;
  failures_total: number;
  repair_count: number;
  cumulative_repair_cost: number;
  average_repair_cost: number;
  other_currency_costs: Record<string, number>;
  mean_days_between_failures: number | null;
  repeat_failures_after_repair: number;
  repair_to_replacement_ratio: number | null;
  failure_threshold: number;
  window_days: number;
  ratio_threshold: number;
  flag_frequent_failures: boolean;
  flag_cost_exceeds_replacement: boolean;
  flag_beyond_useful_life: boolean;
  replacement_review: boolean;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Runs the SQL asset_intelligence() function (RLS applies with a session client). */
export async function loadAssetStats(db: SupabaseClient, assetId?: string): Promise<AssetStats[]> {
  const { data, error } = await db.rpc("asset_intelligence", { p_asset_id: assetId ?? null });
  if (error) throw new Error(`asset intelligence failed: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    ...(r as unknown as AssetStats),
    age_years: num(r.age_years),
    replacement_cost: num(r.replacement_cost),
    cumulative_repair_cost: Number(r.cumulative_repair_cost ?? 0),
    average_repair_cost: Number(r.average_repair_cost ?? 0),
    mean_days_between_failures: num(r.mean_days_between_failures),
    repair_to_replacement_ratio: num(r.repair_to_replacement_ratio),
    ratio_threshold: Number(r.ratio_threshold),
    other_currency_costs: Object.fromEntries(Object.entries((r.other_currency_costs as Record<string, unknown>) ?? {}).map(([k, v]) => [k, Number(v)])),
  }));
}

const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const countWord = (n: number) => (n <= 10 ? words[n] : String(n));
export function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency, maximumFractionDigits: amount % 1 === 0 ? 0 : 2 }).format(amount);
}

/**
 * Deterministic recommendation sentence built ONLY from computed figures.
 * Example: "Washer #3 in Kossuth Dorm B has failed four times within 60 days…"
 */
export function deterministicRecommendation(s: AssetStats): string {
  const parts: string[] = [];
  const failuresInWindow = s.window_days === 60 ? s.failures_60d : s.window_days === 30 ? s.failures_30d : s.window_days === 90 ? s.failures_90d : null;
  const fw = failuresInWindow ?? s.failures_60d;
  parts.push(`${s.asset_name} in ${s.building_name} has failed ${countWord(fw)} time${fw === 1 ? "" : "s"} within ${s.window_days} days.`);
  if (s.replacement_cost !== null) {
    const cmp = s.cumulative_repair_cost > s.replacement_cost ? "exceeding" : "compared with";
    parts.push(
      `Recorded repair expenditure is ${formatMoney(s.cumulative_repair_cost, s.currency)}, ${cmp} the estimated replacement cost of ${formatMoney(s.replacement_cost, s.currency)}.`,
    );
  } else {
    parts.push(`Recorded repair expenditure is ${formatMoney(s.cumulative_repair_cost, s.currency)}; no replacement cost is registered.`);
  }
  if (s.repeat_failures_after_repair > 0 && !s.replacement_review) {
    parts.push(`It has failed again after a previous repair ${countWord(s.repeat_failures_after_repair)} time${s.repeat_failures_after_repair === 1 ? "" : "s"}.`);
  }
  if (s.replacement_review) parts.push("A replacement assessment is recommended.");
  else if (s.flag_frequent_failures || s.flag_cost_exceeds_replacement || s.flag_beyond_useful_life) parts.push("Monitor this asset closely.");
  return parts.join(" ");
}

export function recommendationLevel(s: AssetStats): "replacement_review" | "watch" | "ok" {
  if (s.replacement_review) return "replacement_review";
  if (s.flag_frequent_failures || s.flag_cost_exceeds_replacement || s.flag_beyond_useful_life || s.repeat_failures_after_repair > 0) return "watch";
  return "ok";
}

const NarrativeSchema = z.object({
  pattern_summary: z.string(),
  recommendation: z.string(),
  caveats: z.array(z.string()),
});

/**
 * AI narrative over retrieved records. Claude interprets the facts supplied —
 * it is instructed not to introduce any figure that is not in the input, and
 * the output is labelled as AI-generated decision support.
 */
export async function assetNarrative(stats: AssetStats, history: { ticket_number: string; created_at: string; title: string; total_cost: string | null }[]) {
  if (aiConfig().mode === "mock") {
    return {
      mode: "mock" as const,
      pattern_summary: `[Mock fixture] ${stats.failures_total} recorded failures; ${stats.repeat_failures_after_repair} repeat failure(s) after repair.`,
      recommendation: deterministicRecommendation(stats),
      caveats: ["Mock mode: this narrative is a template, not a live AI interpretation."],
    };
  }
  const res = await callStructured({
    agent: "asset_intelligence",
    system:
      "You are the Asset Intelligence analyst for a university facilities team. Interpret the maintenance facts provided for one asset and write a concise recommendation for management. " +
      "Use ONLY the figures given; never invent costs, dates, ages, prices or counts. If information is missing, say so in caveats. " +
      "Replacement recommendations are decision support only — never state that a purchase has been approved.",
    content: [{ type: "text", text: `FACTS (computed from the database):\n${JSON.stringify({ stats, history }, null, 2)}` }],
    schema: NarrativeSchema,
    effort: "low",
  });
  return { mode: "live" as const, ...res.output };
}
