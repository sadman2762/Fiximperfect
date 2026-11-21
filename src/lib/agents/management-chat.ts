import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { anthropic } from "@/lib/ai/client";
import { aiConfig } from "@/lib/env";
import { loadAssetStats, recommendationLevel } from "@/lib/assets/intelligence";
import { loadOverview } from "@/lib/analytics/queries";

/**
 * Conversational Management Agent. Claude answers management questions by
 * calling a small set of read-only, parameterised tools. There is no SQL tool:
 * every tool runs a fixed query through the caller's RLS-scoped session.
 */

export interface ToolCallLog {
  tool: string;
  input: unknown;
  rows: number;
}

function sinceDays(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export function buildTools(db: SupabaseClient, log: ToolCallLog[]) {
  const ticketsByBuilding = async (input: { category?: string | null; since_days: number }) => {
    let q = db
      .from("tickets")
      .select("category, buildings(name)")
      .is("merged_into", null)
      .gte("created_at", sinceDays(input.since_days));
    if (input.category) q = q.ilike("category", `%${input.category}%`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const counts: Record<string, number> = {};
    for (const r of (data ?? []) as unknown as { buildings: { name: string } }[]) counts[r.buildings.name] = (counts[r.buildings.name] ?? 0) + 1;
    const rows = Object.entries(counts)
      .map(([building, tickets]) => ({ building, tickets }))
      .sort((a, b) => b.tickets - a.tickets);
    log.push({ tool: "tickets_by_building", input, rows: rows.length });
    return rows;
  };

  const repairCosts = async (input: { limit: number; category?: string | null }) => {
    const stats = await loadAssetStats(db);
    const rows = stats
      .filter((s) => !input.category || s.category.toLowerCase().includes(input.category.toLowerCase()))
      .sort((a, b) => b.cumulative_repair_cost - a.cumulative_repair_cost)
      .slice(0, input.limit)
      .map((s) => ({
        asset: s.asset_name,
        asset_code: s.asset_code,
        building: s.building_name,
        category: s.category,
        cumulative_repair_cost: s.cumulative_repair_cost,
        currency: s.currency,
        repairs: s.repair_count,
      }));
    log.push({ tool: "top_repair_costs", input, rows: rows.length });
    return rows;
  };

  const replacementCandidates = async () => {
    const stats = await loadAssetStats(db);
    const rows = stats
      .filter((s) => recommendationLevel(s) !== "ok")
      .map((s) => ({
        asset: s.asset_name,
        asset_code: s.asset_code,
        building: s.building_name,
        level: recommendationLevel(s),
        failures_in_window: s.failures_60d,
        window_days: s.window_days,
        cumulative_repair_cost: s.cumulative_repair_cost,
        replacement_cost: s.replacement_cost,
        currency: s.currency,
        repair_to_replacement_ratio_pct: s.repair_to_replacement_ratio,
        age_years: s.age_years,
      }));
    log.push({ tool: "replacement_candidates", input: {}, rows: rows.length });
    return rows;
  };

  const overview = async (input: { since_days?: number | null }) => {
    const o = await loadOverview(db, input.since_days ? new Date(sinceDays(input.since_days)) : undefined);
    log.push({ tool: "overview_metrics", input, rows: 1 });
    return o;
  };

  return { ticketsByBuilding, repairCosts, replacementCandidates, overview };
}

const SYSTEM = `You are the Fiximperfect management assistant for university facilities managers.
Answer questions about dormitory maintenance using ONLY data returned by your tools. Always call a tool before stating a
number. Never estimate or invent figures, dates or costs; if the tools cannot answer, say what data is missing.
Mention the time window you used. Monetary values must keep their currency. Replacement suggestions are decision support
only. Keep answers short (2-5 sentences, or a compact list).`;

export async function askManagementAgent(db: SupabaseClient, question: string) {
  const log: ToolCallLog[] = [];
  const t = buildTools(db, log);

  if (aiConfig().mode === "mock") return mockAnswer(question, t, log);

  const tools = [
    betaZodTool({
      name: "tickets_by_building",
      description: "Count unique maintenance tickets per building, optionally for one category, over the last N days.",
      inputSchema: z.object({
        category: z.string().nullable().optional().describe("Category name or fragment, e.g. 'Plumbing'"),
        since_days: z.number().int().min(1).max(730).describe("Look-back window in days (a semester is ~120)"),
      }),
      run: async (input) => JSON.stringify(await t.ticketsByBuilding(input)),
    }),
    betaZodTool({
      name: "top_repair_costs",
      description: "Assets ranked by cumulative recorded repair cost (all time).",
      inputSchema: z.object({ limit: z.number().int().min(1).max(20), category: z.string().nullable().optional() }),
      run: async (input) => JSON.stringify(await t.repairCosts(input)),
    }),
    betaZodTool({
      name: "replacement_candidates",
      description: "Assets flagged for replacement review or monitoring, with failures, repair costs and ratios.",
      inputSchema: z.object({}),
      run: async () => JSON.stringify(await t.replacementCandidates()),
    }),
    betaZodTool({
      name: "overview_metrics",
      description: "Headline metrics: reports, unique tickets, duplicate rate, resolution times, verified resolution rate, reopen rate, costs.",
      inputSchema: z.object({ since_days: z.number().int().min(1).max(730).nullable().optional() }),
      run: async (input) => JSON.stringify(await t.overview(input)),
    }),
  ];

  const final = await anthropic().beta.messages.toolRunner({
    model: aiConfig().model,
    max_tokens: 4096,
    system: SYSTEM,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    tools,
    max_iterations: 6,
    messages: [{ role: "user", content: question.slice(0, 1000) }],
  });
  if (final.stop_reason === "refusal") return { mode: "live" as const, answer: "The assistant could not answer this request.", tools: log };
  const answer = final.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
  return { mode: "live" as const, answer: answer || "No answer was produced.", tools: log };
}

async function mockAnswer(question: string, t: ReturnType<typeof buildTools>, log: ToolCallLog[]) {
  const q = question.toLowerCase();
  const category = ["plumbing", "laundry", "heating", "electrical", "internet", "furniture", "kitchen"].find((c) => q.includes(c)) ?? null;
  let answer: string;
  if (/replac/.test(q)) {
    const rows = await t.replacementCandidates();
    answer = rows.length
      ? rows.map((r) => `${r.asset} (${r.building}): ${r.level.replace("_", " ")}, ${r.failures_in_window} failures in ${r.window_days} days, repair/replacement ${r.repair_to_replacement_ratio_pct ?? "n/a"}%.`).join("\n")
      : "No assets currently meet the replacement-review or watch criteria.";
  } else if (/cost|expens|spend/.test(q)) {
    const rows = await t.repairCosts({ limit: 5, category });
    answer = rows.length ? rows.map((r) => `${r.asset} (${r.building}): ${r.cumulative_repair_cost.toFixed(2)} ${r.currency} over ${r.repairs} repair(s).`).join("\n") : "No repair costs are recorded.";
  } else {
    const rows = await t.ticketsByBuilding({ category, since_days: 120 });
    answer = rows.length
      ? `Over the last 120 days${category ? ` (${category})` : ""}: ` + rows.map((r) => `${r.building} ${r.tickets}`).join(", ") + "."
      : "No matching tickets in the last 120 days.";
  }
  return { mode: "mock" as const, answer: `[Mock mode — rule-based answer from live database records]\n${answer}`, tools: log };
}
