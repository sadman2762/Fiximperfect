import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Download } from "lucide-react";
import { requireStaffPage } from "@/lib/auth/session";
import { sessionClient } from "@/lib/supabase/server";
import { deterministicRecommendation, formatMoney, loadAssetStats, recommendationLevel } from "@/lib/assets/intelligence";
import { PageHeader, StatTile, formatDate } from "@/components/shared/ui-bits";
import { LevelBadge } from "@/components/assets/level-badge";
import { StatusBadge } from "@/components/shared/badges";
import { AssetNarrative } from "@/components/assets/asset-narrative";
import { buttonVariants } from "@/components/ui/button";
import type { TicketStatus } from "@/types/domain";

export const metadata: Metadata = { title: "Asset history" };

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffPage(["caretaker", "administrator", "management"]);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await sessionClient();
  const { data: asset } = await db.from("assets").select("*").eq("id", id).maybeSingle();
  if (!asset) notFound();
  const [[s], tickets, costs, feedback] = await Promise.all([
    loadAssetStats(db, id),
    db.from("tickets").select("id, ticket_number, title, status, created_at, resolved_at, reopened_count, resolution_verified, merged_into, reports!reports_ticket_id_fkey(count)").eq("asset_id", id).is("merged_into", null).order("created_at", { ascending: false }),
    db.from("maintenance_costs").select("id, ticket_id, parts_cost, labour_cost, other_cost, total_cost, currency, expense_date, notes, tickets(ticket_number)").eq("asset_id", id).order("expense_date", { ascending: false }),
    db.from("resolution_feedback").select("id, response, responded_at, tickets!inner(asset_id, ticket_number)").eq("tickets.asset_id", id).not("response", "is", null),
  ]);
  const level = recommendationLevel(s);
  const windowFailures = s.window_days === 30 ? s.failures_30d : s.window_days === 90 ? s.failures_90d : s.failures_60d;

  return (
    <>
      <Link href="/assets" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Assets
      </Link>
      <PageHeader
        title={`${asset.asset_name} (${asset.asset_code})`}
        description={`${s.building_name} · floor ${s.floor} · ${s.location_name} · ${asset.manufacturer ?? "unknown make"} ${asset.model ?? ""} · installed ${asset.installation_date ?? "unknown"}`}
        actions={
          asset.qr_slug && staff.role !== "management" ? (
            <a href={`/api/qr/${asset.qr_slug}?format=png`} className={buttonVariants({ variant: "outline" })}>
              <Download aria-hidden /> QR label
            </a>
          ) : null
        }
      />
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <StatTile label={`Failures (${s.window_days} days)`} value={windowFailures} hint={`threshold ${s.failure_threshold}`} tone={s.flag_frequent_failures ? "critical" : "default"} />
        <StatTile label="Failures (all time)" value={s.failures_total} hint={`${s.repeat_failures_after_repair} repeat after repair`} />
        <StatTile label="Repair spend" value={formatMoney(s.cumulative_repair_cost, s.currency)} hint={`${s.repair_count} repairs · avg ${formatMoney(s.average_repair_cost, s.currency)}`} />
        <StatTile label="Replacement cost" value={s.replacement_cost !== null ? formatMoney(s.replacement_cost, s.currency) : "—"} />
        <StatTile label="Repair ÷ replacement" value={s.repair_to_replacement_ratio !== null ? `${s.repair_to_replacement_ratio}%` : "—"} hint={`threshold ${s.ratio_threshold}%`} tone={s.flag_cost_exceeds_replacement ? "critical" : "default"} />
        <StatTile label="Age" value={s.age_years !== null ? `${s.age_years} y` : "—"} hint={s.expected_useful_life_years ? `expected life ${s.expected_useful_life_years} y` : undefined} />
      </section>

      <section className="mt-4 rounded-xl bg-card p-4 surface">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">Recommendation</h2>
          <LevelBadge level={level} />
        </div>
        <p className="mt-2 text-sm">{deterministicRecommendation(s)}</p>
        <div className="mt-3 rounded-xl bg-muted/50 p-3 text-xs">
          <p className="font-medium">How this was calculated</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>
              Failures in the last {s.window_days} days = unique tickets on this asset = <strong>{windowFailures}</strong> (rule: ≥ {s.failure_threshold}) → {s.flag_frequent_failures ? "met" : "not met"}
            </li>
            <li>
              Repair-to-replacement ratio = {formatMoney(s.cumulative_repair_cost, s.currency)} ÷ {s.replacement_cost !== null ? formatMoney(s.replacement_cost, s.currency) : "n/a"} × 100 ={" "}
              <strong>{s.repair_to_replacement_ratio ?? "n/a"}%</strong> (rule: &gt; {s.ratio_threshold}%) → {s.flag_cost_exceeds_replacement ? "met" : "not met"}
            </li>
            <li>Replacement review requires both conditions. Thresholds are configurable by administrators.</li>
            {Object.keys(s.other_currency_costs).length ? (
              <li>
                Costs recorded in other currencies are excluded (no conversion applied): {Object.entries(s.other_currency_costs).map(([c, v]) => `${v} ${c}`).join(", ")}
              </li>
            ) : null}
          </ul>
          <p className="mt-2 text-muted-foreground">Decision support only — Fiximperfect never authorises purchases.</p>
        </div>
        <AssetNarrative assetId={id} />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl bg-card p-4 surface">
          <h2 className="mb-3 text-sm font-semibold">Maintenance tickets</h2>
          <ul className="divide-y text-sm">
            {(tickets.data ?? []).map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <Link href={`/tickets/${t.id}`} className="font-mono text-xs text-[#0071e3] hover:underline">
                    {t.ticket_number}
                  </Link>{" "}
                  {t.title}
                  <div className="text-xs text-muted-foreground">
                    {formatDate(t.created_at, false)} · {(t.reports as { count: number }[])[0]?.count ?? 0} report(s)
                    {t.reopened_count ? ` · reopened ${t.reopened_count}×` : ""}
                    {t.resolution_verified ? " · student-verified" : ""}
                  </div>
                </div>
                <StatusBadge status={t.status as TicketStatus} />
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl bg-card p-4 surface">
          <h2 className="mb-3 text-sm font-semibold">Expenditure records</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Date</th>
                <th className="py-1 font-medium">Ticket</th>
                <th className="py-1 text-right font-medium">Parts</th>
                <th className="py-1 text-right font-medium">Labour</th>
                <th className="py-1 text-right font-medium">Other</th>
                <th className="py-1 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {(costs.data ?? []).map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="py-1.5">{c.expense_date}</td>
                  <td className="py-1.5 font-mono text-xs">{(c.tickets as unknown as { ticket_number: string } | null)?.ticket_number}</td>
                  <td className="py-1.5 text-right">{c.parts_cost}</td>
                  <td className="py-1.5 text-right">{c.labour_cost}</td>
                  <td className="py-1.5 text-right">{c.other_cost}</td>
                  <td className="py-1.5 text-right font-medium">
                    {c.total_cost} {c.currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">
            Student feedback on repairs: {(feedback.data ?? []).filter((f) => f.response === "fixed").length} confirmed fixed, {(feedback.data ?? []).filter((f) => f.response === "still_broken").length} still broken.
          </p>
          {asset.is_demo ? <p className="mt-1 text-xs text-orange-800">Fictional demonstration data.</p> : null}
        </section>
      </div>
    </>
  );
}
