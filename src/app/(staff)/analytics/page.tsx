import Link from "next/link";
import type { Metadata } from "next";
import { requireStaffPage } from "@/lib/auth/session";
import { sessionClient } from "@/lib/supabase/server";
import { loadBreakdowns, loadOverview } from "@/lib/analytics/queries";
import { deterministicRecommendation, formatMoney, loadAssetStats, recommendationLevel } from "@/lib/assets/intelligence";
import { PageHeader, StatTile, formatHours } from "@/components/shared/ui-bits";
import { GroupedColumns, HorizontalBars, TrendLines } from "@/components/analytics/charts";
import { ManagementChat } from "@/components/analytics/management-chat";
import { LevelBadge } from "@/components/assets/level-badge";
import { LiveRefresh } from "@/components/dashboard/live-refresh";

export const metadata: Metadata = { title: "Management" };

function Panel({ title, subtitle, children, className }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl bg-card p-5 surface ${className ?? ""}`}>
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

const money = (costs: Record<string, number>) =>
  Object.entries(costs).length ? Object.entries(costs).map(([c, v]) => formatMoney(v, c)).join(" + ") : formatMoney(0, "EUR");

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await requireStaffPage(["management", "administrator", "caretaker"]);
  const { range } = await searchParams;
  const days = range === "30" ? 30 : range === "90" ? 90 : range === "365" ? 365 : null;
  const since = days ? new Date(Date.now() - days * 86_400_000) : undefined;
  const db = await sessionClient();
  const [o, b, assets] = await Promise.all([loadOverview(db, since), loadBreakdowns(db, since), loadAssetStats(db)]);
  const flagged = assets.filter((a) => recommendationLevel(a) !== "ok").sort((x, y) => (y.repair_to_replacement_ratio ?? 0) - (x.repair_to_replacement_ratio ?? 0));
  const topCost = [...assets].sort((x, y) => y.cumulative_repair_cost - x.cumulative_repair_cost).slice(0, 6);

  // Pivot weekly trend to one row per week, one column per building (zeros filled).
  const buildings = b.by_building.map((x) => x.building_name).slice(0, 3);
  const weeks = [...new Set(b.weekly_trend.map((w) => w.week))].sort();
  const trend = weeks.map((w) => ({
    week: w.slice(5),
    ...Object.fromEntries(buildings.map((bn) => [bn, b.weekly_trend.find((x) => x.week === w && x.building_name === bn)?.tickets ?? 0])),
  }));

  const ranges = [
    { key: undefined, label: "All time" },
    { key: "30", label: "30 days" },
    { key: "90", label: "90 days" },
    { key: "365", label: "12 months" },
  ];

  return (
    <>
      <LiveRefresh pollMs={60_000} />
      <PageHeader
        title="Insights"
        description="Operational and financial view. Every figure is computed in SQL from stored records."
        actions={
          <nav aria-label="Time range" className="flex border border-[#e1e5eb] bg-[#f1f3f6] p-1 text-[13px]">
            {ranges.map((r) => (
              <Link key={r.label} href={r.key ? `/analytics?range=${r.key}` : "/analytics"} aria-current={range === r.key ? "page" : undefined} className={`px-3.5 py-1 transition-colors ${range === r.key ? "bg-[#0071e3] font-medium text-white shadow-[0_0_18px_-4px_rgba(0,113,197,0.9)]" : "text-muted-foreground hover:text-foreground"}`}>
                {r.label}
              </Link>
            ))}
          </nav>
        }
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Maintenance reports" value={o.total_reports} hint="individual student submissions" />
        <StatTile label="Unique tickets" value={o.unique_tickets} hint={`${o.duplicate_reports} duplicate reports linked`} />
        <StatTile label="Duplicate report rate" value={`${o.duplicate_report_rate}%`} />
        <StatTile label="Avg. resolution time" value={formatHours(o.avg_resolution_hours)} />
        <StatTile
          label="Verified resolution rate"
          value={o.verified_resolution_rate !== null ? `${o.verified_resolution_rate}%` : "—"}
          hint={`${o.student_verified} of ${o.tickets_marked_resolved} resolved tickets student-verified`}
        />
        <StatTile label="Reopened tickets" value={o.reopened_rate !== null ? `${o.reopened_rate}%` : "—"} hint={`${o.reopened_tickets} reopened · ${o.repeat_failures_after_resolution} repeat failures after repair`} />
        <StatTile label="Unverified resolutions" value={o.unverified_resolutions} hint={`avg. to verified: ${formatHours(o.avg_hours_to_verified)}`} />
        <StatTile label="Maintenance costs" value={money(o.costs_by_currency)} hint="currencies are never combined" />
      </section>

      <section className="mt-6 rounded-xl bg-card p-5 surface">
        <h2 className="text-[17px] font-semibold">Asset intelligence — replacement review</h2>
        <p className="text-xs text-muted-foreground">Rule: failures within the window ≥ threshold AND cumulative repair cost &gt; replacement cost. Decision support only.</p>
        {flagged.length ? (
          <ul className="mt-3 space-y-3">
            {flagged.map((a) => (
              <li key={a.asset_id} className="rounded-xl bg-[#f7f9fc] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/assets/${a.asset_id}`} className="font-medium text-[#0071e3] hover:underline">
                    {a.asset_name} · {a.building_name}
                  </Link>
                  <LevelBadge level={recommendationLevel(a)} />
                </div>
                <p className="mt-1 text-sm">{deterministicRecommendation(a)}</p>
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  Age {a.age_years ?? "—"} y · {a.repair_count} repairs · repair ÷ replacement {a.repair_to_replacement_ratio ?? "—"}% ·{" "}
                  <Link className="text-[#0071e3] underline" href={`/assets/${a.asset_id}`}>
                    view supporting records
                  </Link>
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No assets currently meet the review criteria.</p>
        )}
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Problems by category" subtitle="Unique tickets">
          <HorizontalBars data={b.by_category} dataKey="tickets" nameKey="category" label="Unique tickets" />
        </Panel>
        <Panel title="Reports vs unique tickets by building" subtitle="The gap is duplicate reports linked automatically">
          <GroupedColumns
            data={b.by_building}
            nameKey="building_name"
            series={[
              { key: "reports", label: "Reports" },
              { key: "tickets", label: "Unique tickets" },
            ]}
          />
        </Panel>
        <Panel title="Weekly new tickets by building" subtitle="Last 12 weeks">
          {trend.length ? <TrendLines data={trend} xKey="week" series={buildings} /> : <p className="text-sm text-muted-foreground">No tickets in the last 12 weeks.</p>}
        </Panel>
        <Panel title="Maintenance team workload" subtitle="Open tickets per team">
          <HorizontalBars data={b.team_workload.filter((t) => t.open_tickets > 0 || t.completed > 0)} dataKey="open_tickets" nameKey="team_name" label="Open tickets" />
        </Panel>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Building comparison" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm tabular-nums">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Building</th>
                  <th className="py-1 text-right font-medium">Reports</th>
                  <th className="py-1 text-right font-medium">Tickets</th>
                  <th className="py-1 text-right font-medium">Critical</th>
                  <th className="py-1 text-right font-medium">Recurring assets</th>
                  <th className="py-1 text-right font-medium">Avg. resolution</th>
                  <th className="py-1 text-right font-medium">Costs</th>
                </tr>
              </thead>
              <tbody>
                {b.by_building.map((x) => (
                  <tr key={x.building_id} className="border-t">
                    <td className="py-1.5">{x.building_name}</td>
                    <td className="py-1.5 text-right">{x.reports}</td>
                    <td className="py-1.5 text-right">{x.tickets}</td>
                    <td className="py-1.5 text-right">{x.critical_incidents}</td>
                    <td className="py-1.5 text-right">{x.recurring_assets}</td>
                    <td className="py-1.5 text-right">{formatHours(x.avg_resolution_hours)}</td>
                    <td className="py-1.5 text-right">{money(x.costs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Highest repair spend (all time)">
          <table className="w-full text-sm tabular-nums">
            <tbody>
              {topCost.map((a) => (
                <tr key={a.asset_id} className="border-t first:border-0">
                  <td className="py-1.5">
                    <Link href={`/assets/${a.asset_id}`} className="hover:underline">
                      {a.asset_name}
                    </Link>{" "}
                    <span className="text-xs text-muted-foreground">{a.building_name}</span>
                  </td>
                  <td className="py-1.5 text-right text-muted-foreground">{a.repair_count} {a.repair_count === 1 ? "repair" : "repairs"}</td>
                  <td className="py-1.5 text-right font-medium">{formatMoney(a.cumulative_repair_cost, a.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <div className="mt-6">
        <ManagementChat />
      </div>
    </>
  );
}
