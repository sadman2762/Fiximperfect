import Link from "next/link";
import type { Metadata } from "next";
import { requireStaffPage } from "@/lib/auth/session";
import { sessionClient } from "@/lib/supabase/server";
import { formatMoney, loadAssetStats, recommendationLevel } from "@/lib/assets/intelligence";
import { PageHeader } from "@/components/shared/ui-bits";
import { LevelBadge } from "@/components/assets/level-badge";

export const metadata: Metadata = { title: "Assets" };

export default async function AssetsPage() {
  await requireStaffPage(["caretaker", "administrator", "management"]);
  const stats = await loadAssetStats(await sessionClient());
  const order = { replacement_review: 0, watch: 1, ok: 2 } as const;
  stats.sort((a, b) => order[recommendationLevel(a)] - order[recommendationLevel(b)] || b.cumulative_repair_cost - a.cumulative_repair_cost);
  return (
    <>
      <PageHeader title="Assets" description="Failure frequency and repair spend per asset, computed from recorded tickets and expenses." />
      <div className="overflow-x-auto rounded-2xl bg-card surface">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-black/[0.06] text-left text-[12px] text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Asset</th>
              <th className="px-3 py-2 font-medium">Building / location</th>
              <th className="px-3 py-2 text-right font-medium">Age</th>
              <th className="px-3 py-2 text-right font-medium">Failures 30/60/90 d</th>
              <th className="px-3 py-2 text-right font-medium">Repair spend</th>
              <th className="px-3 py-2 text-right font-medium">Replacement</th>
              <th className="px-3 py-2 text-right font-medium">Repair ÷ replacement</th>
              <th className="px-3 py-2 font-medium">Recommendation</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.asset_id} className="border-b last:border-0 hover:bg-black/[0.018]">
                <td className="px-4 py-3.5">
                  <Link href={`/assets/${s.asset_id}`} className="font-medium text-primary hover:underline">
                    {s.asset_name}
                  </Link>
                  <div className="font-mono text-xs text-muted-foreground">{s.asset_code}</div>
                </td>
                <td className="px-4 py-3.5">
                  {s.building_name}
                  <div className="text-xs text-muted-foreground">
                    Floor {s.floor} · {s.location_name}
                  </div>
                </td>
                <td className="px-4 py-3.5 text-right tabular-nums">
                  {s.age_years !== null ? `${s.age_years} y` : "—"}
                  {s.expected_useful_life_years ? <span className="text-xs text-muted-foreground"> / {s.expected_useful_life_years}</span> : null}
                </td>
                <td className="px-4 py-3.5 text-right tabular-nums">
                  {s.failures_30d} / {s.failures_60d} / {s.failures_90d}
                </td>
                <td className="px-4 py-3.5 text-right tabular-nums">{formatMoney(s.cumulative_repair_cost, s.currency)}</td>
                <td className="px-4 py-3.5 text-right tabular-nums">{s.replacement_cost !== null ? formatMoney(s.replacement_cost, s.currency) : "—"}</td>
                <td className="px-4 py-3.5 text-right tabular-nums">{s.repair_to_replacement_ratio !== null ? `${s.repair_to_replacement_ratio}%` : "—"}</td>
                <td className="px-4 py-3.5">
                  <LevelBadge level={recommendationLevel(s)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
