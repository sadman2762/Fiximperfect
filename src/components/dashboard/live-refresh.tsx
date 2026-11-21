"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/browser";

/**
 * Keeps server-rendered dashboards fresh: subscribes to Supabase Realtime
 * changes (RLS-filtered) and refreshes; falls back to polling when Realtime is
 * unavailable (e.g. the local Docker-free stack).
 */
export function LiveRefresh({ tables = ["tickets", "emergency_alerts", "reports"], pollMs = 20_000 }: { tables?: string[]; pollMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = browserClient();
    let poll: ReturnType<typeof setInterval> | null = null;
    let pending: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        router.refresh();
      }, 500);
    };
    const channel = supabase.channel("fiximperfect-dashboard");
    for (const table of tables) channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    channel.subscribe((status) => {
      if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") && !poll) poll = setInterval(() => router.refresh(), pollMs);
    });
    const fallback = setTimeout(() => {
      if (channel.state !== "joined" && !poll) poll = setInterval(() => router.refresh(), pollMs);
    }, 5000);
    return () => {
      clearTimeout(fallback);
      if (poll) clearInterval(poll);
      if (pending) clearTimeout(pending);
      supabase.removeChannel(channel);
    };
  }, [router, tables, pollMs]);
  return null;
}

