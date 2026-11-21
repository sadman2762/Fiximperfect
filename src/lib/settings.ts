import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AppSettings {
  duplicate_auto_link_threshold: number;
  duplicate_review_threshold: number;
  duplicate_window_days: number;
  classification_review_threshold: number;
  emergency_ack_timeout_minutes: number;
  replacement_failure_threshold: number;
  replacement_window_days: number;
  replacement_cost_ratio_threshold: number;
  feedback_token_ttl_days: number;
  backlog_alert_threshold: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  duplicate_auto_link_threshold: 0.85,
  duplicate_review_threshold: 0.65,
  duplicate_window_days: 14,
  classification_review_threshold: 0.55,
  emergency_ack_timeout_minutes: 10,
  replacement_failure_threshold: 4,
  replacement_window_days: 60,
  replacement_cost_ratio_threshold: 100,
  feedback_token_ttl_days: 14,
  backlog_alert_threshold: 25,
};

export const SETTING_BOUNDS: Record<keyof AppSettings, [number, number]> = {
  duplicate_auto_link_threshold: [0.5, 1],
  duplicate_review_threshold: [0.3, 1],
  duplicate_window_days: [1, 90],
  classification_review_threshold: [0, 1],
  emergency_ack_timeout_minutes: [1, 240],
  replacement_failure_threshold: [1, 50],
  replacement_window_days: [7, 365],
  replacement_cost_ratio_threshold: [10, 1000],
  feedback_token_ttl_days: [1, 60],
  backlog_alert_threshold: [1, 1000],
};

export async function loadSettings(db: SupabaseClient): Promise<AppSettings> {
  const { data } = await db.from("app_settings").select("key, value");
  const out = { ...DEFAULT_SETTINGS };
  for (const row of data ?? []) {
    const key = row.key as keyof AppSettings;
    if (key in out) {
      const n = Number(row.value);
      if (Number.isFinite(n)) out[key] = n;
    }
  }
  return out;
}
