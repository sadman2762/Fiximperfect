import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface Overview {
  total_reports: number;
  unique_tickets: number;
  tickets_with_reports: number;
  duplicate_reports: number;
  duplicate_report_rate: number;
  active_tickets: number;
  critical_active: number;
  high_active: number;
  unassigned_active: number;
  needs_review: number;
  in_progress: number;
  reopened_active: number;
  avg_resolution_hours: number | null;
  tickets_marked_resolved: number;
  student_verified: number;
  verified_resolution_rate: number | null;
  reopened_tickets: number;
  reopened_rate: number | null;
  unverified_resolutions: number;
  avg_hours_to_verified: number | null;
  repeat_failures_after_resolution: number;
  costs_by_currency: Record<string, number>;
  open_emergencies: number;
}

export interface Breakdowns {
  by_category: { category: string; tickets: number; reports: number }[];
  by_building: {
    building_id: string;
    building_name: string;
    reports: number;
    tickets: number;
    critical_incidents: number;
    recurring_assets: number;
    avg_resolution_hours: number | null;
    costs: Record<string, number>;
  }[];
  team_workload: { team_id: string; team_name: string; open_tickets: number; in_progress: number; completed: number }[];
  weekly_trend: { week: string; building_name: string; tickets: number }[];
  status_distribution: Record<string, number>;
}

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** All figures come from SQL (analytics_overview); RLS scopes them to the user's buildings. */
export async function loadOverview(db: SupabaseClient, since?: Date): Promise<Overview> {
  const { data, error } = await db.rpc("analytics_overview", { p_since: since?.toISOString() ?? null });
  if (error) throw new Error(`analytics failed: ${error.message}`);
  const o = data as Record<string, unknown>;
  return {
    ...(o as unknown as Overview),
    duplicate_report_rate: Number(o.duplicate_report_rate ?? 0),
    avg_resolution_hours: n(o.avg_resolution_hours),
    verified_resolution_rate: n(o.verified_resolution_rate),
    reopened_rate: n(o.reopened_rate),
    avg_hours_to_verified: n(o.avg_hours_to_verified),
    costs_by_currency: Object.fromEntries(Object.entries((o.costs_by_currency as Record<string, unknown>) ?? {}).map(([k, v]) => [k, Number(v)])),
  };
}

export async function loadBreakdowns(db: SupabaseClient, since?: Date): Promise<Breakdowns> {
  const { data, error } = await db.rpc("analytics_breakdowns", { p_since: since?.toISOString() ?? null });
  if (error) throw new Error(`analytics failed: ${error.message}`);
  const b = data as Breakdowns;
  return {
    ...b,
    by_building: b.by_building.map((x) => ({
      ...x,
      avg_resolution_hours: n(x.avg_resolution_hours),
      costs: Object.fromEntries(Object.entries(x.costs ?? {}).map(([k, v]) => [k, Number(v)])),
    })),
  };
}

