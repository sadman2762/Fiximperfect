"use client";

import { Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/* Chart tokens come from globals.css (validated reference palette). */
const C = {
  s1: "var(--series-1)",
  s2: "var(--series-2)",
  s3: "var(--series-3)",
  grid: "var(--viz-grid)",
  axis: "var(--viz-axis)",
  muted: "var(--viz-muted)",
  ink2: "var(--viz-ink-2)",
};
const SERIES = [C.s1, C.s2, C.s3];
const tick = { fill: C.muted, fontSize: 12 };

function TooltipBox({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-[#dde2e5] bg-white px-3 py-2 text-xs text-[#183247] shadow-lg">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: p.color }} aria-hidden />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto pl-3 font-medium tabular-nums">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

/** Single-series horizontal bar (no legend; the card title names the measure). */
export function HorizontalBars({ data, dataKey, nameKey, label }: { data: Record<string, unknown>[]; dataKey: string; nameKey: string; label: string }) {
  const height = Math.max(120, data.length * 34 + 30);
  return (
    <div style={{ height }} role="img" aria-label={`${label} bar chart`}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 36, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke={C.grid} />
          <XAxis type="number" allowDecimals={false} tick={tick} axisLine={{ stroke: C.axis }} tickLine={false} />
          <YAxis type="category" dataKey={nameKey} width={190} tick={{ ...tick, fill: C.ink2, fontSize: 11 }} interval={0} axisLine={false} tickLine={false} />
          <Tooltip content={<TooltipBox />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
          <Bar dataKey={dataKey} name={label} fill={C.s1} radius={[0, 4, 4, 0]} maxBarSize={24}>
            <LabelList dataKey={dataKey} position="right" style={{ fill: C.ink2, fontSize: 12 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Two-series grouped columns with legend (e.g. reports vs unique tickets). */
export function GroupedColumns({ data, nameKey, series }: { data: Record<string, unknown>[]; nameKey: string; series: { key: string; label: string }[] }) {
  return (
    <div className="h-64" role="img" aria-label={`${series.map((s) => s.label).join(" and ")} by ${nameKey}`}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ left: 0, right: 8, top: 16, bottom: 4 }} barGap={2}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey={nameKey} tick={{ ...tick, fill: C.ink2 }} axisLine={{ stroke: C.axis }} tickLine={false} />
          <YAxis allowDecimals={false} tick={tick} axisLine={false} tickLine={false} width={32} />
          <Tooltip content={<TooltipBox />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: C.ink2 }} />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={SERIES[i]} radius={[4, 4, 0, 0]} maxBarSize={24}>
              <LabelList dataKey={s.key} position="top" style={{ fill: C.ink2, fontSize: 11 }} />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Up to three series over time: legend + crosshair tooltip + direct end labels. */
export function TrendLines({ data, xKey, series }: { data: Record<string, unknown>[]; xKey: string; series: string[] }) {
  const last = data.length - 1;
  return (
    <div className="h-64" role="img" aria-label={`Weekly tickets for ${series.join(", ")}`}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ left: 0, right: 110, top: 8, bottom: 4 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey={xKey} tick={tick} axisLine={{ stroke: C.axis }} tickLine={false} />
          <YAxis allowDecimals={false} tick={tick} axisLine={false} tickLine={false} width={32} />
          <Tooltip content={<TooltipBox />} cursor={{ stroke: C.axis }} />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: C.ink2 }} />
          {series.slice(0, 3).map((s, i) => (
            <Line key={s} type="linear" dataKey={s} name={s} stroke={SERIES[i]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--viz-surface)", strokeWidth: 2 }}>
              <LabelList
                dataKey={s}
                content={(p) => {
                  const { x, y, index } = p as { x?: number; y?: number; index?: number };
                  if (index !== last || x === undefined || y === undefined) return null;
                  return (
                    <text x={Number(x) + 8} y={Number(y) + 4} fontSize={11} fill="var(--viz-ink-2)">
                      {s}
                    </text>
                  );
                }}
              />
            </Line>
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

