import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TeamOption } from "@/lib/agents/schemas";

export interface RoutingDirectory {
  teams: TeamOption[];
  /** Team name required by DB rules for (category, building), if any. */
  ruleTeamName: string | null;
  manualQueue: TeamOption | null;
  categoryDefaultPriority: string | null;
}

/** Loads the team directory and DB routing rule for a category in a building. */
export async function loadRoutingDirectory(db: SupabaseClient, category: string, buildingId: string): Promise<RoutingDirectory> {
  const [teamsRes, catRes, openRes] = await Promise.all([
    db.from("maintenance_teams").select("id, team_name, responsible_categories, is_manual_review_queue"),
    db.from("categories").select("id, name, default_team_id, default_priority").eq("name", category).maybeSingle(),
    db.from("tickets").select("assigned_team_id").not("status", "in", "(resolved,closed)").not("assigned_team_id", "is", null),
  ]);
  if (teamsRes.error) throw new Error(`team directory failed: ${teamsRes.error.message}`);
  const open = new Map<string, number>();
  for (const r of openRes.data ?? []) open.set(r.assigned_team_id as string, (open.get(r.assigned_team_id as string) ?? 0) + 1);
  const teams: TeamOption[] = (teamsRes.data ?? []).map((t) => ({
    id: t.id as string,
    team_name: t.team_name as string,
    responsible_categories: (t.responsible_categories as string[]) ?? [],
    is_manual_review_queue: Boolean(t.is_manual_review_queue),
    open_tickets: open.get(t.id as string) ?? 0,
  }));

  let ruleTeamId: string | null = null;
  if (catRes.data) {
    const { data: rules } = await db
      .from("routing_rules")
      .select("team_id, building_id")
      .eq("category_id", catRes.data.id)
      .or(`building_id.eq.${buildingId},building_id.is.null`);
    const specific = rules?.find((r) => r.building_id === buildingId) ?? rules?.find((r) => r.building_id === null);
    ruleTeamId = (specific?.team_id as string | undefined) ?? (catRes.data.default_team_id as string | null);
  }
  return {
    teams,
    ruleTeamName: teams.find((t) => t.id === ruleTeamId)?.team_name ?? null,
    manualQueue: teams.find((t) => t.is_manual_review_queue) ?? null,
    categoryDefaultPriority: (catRes.data?.default_priority as string | undefined) ?? null,
  };
}

export interface RoutingDecision {
  teamId: string | null;
  teamName: string | null;
  reason: string;
  source: "ai_validated" | "rule" | "manual_review";
  needsReview: boolean;
}

/**
 * Validates the AI's team recommendation against the directory. The AI may
 * only choose an existing team that is responsible for the category; otherwise
 * the database rule applies; otherwise the ticket goes to manual review.
 */
export function resolveRouting(
  dir: RoutingDirectory,
  category: string,
  aiTeamName: string | null,
  aiReason: string | null,
): RoutingDecision {
  const aiTeam = aiTeamName ? dir.teams.find((t) => t.team_name === aiTeamName) : undefined;
  if (aiTeam && !aiTeam.is_manual_review_queue && aiTeam.responsible_categories.includes(category)) {
    return { teamId: aiTeam.id, teamName: aiTeam.team_name, reason: aiReason ?? `Responsible for ${category}.`, source: "ai_validated", needsReview: false };
  }
  const ruleTeam = dir.ruleTeamName ? dir.teams.find((t) => t.team_name === dir.ruleTeamName) : undefined;
  if (ruleTeam) {
    const note = aiTeamName && !aiTeam ? ` (AI suggested unknown team "${aiTeamName}", ignored)` : "";
    return { teamId: ruleTeam.id, teamName: ruleTeam.team_name, reason: `Routing rule: ${category} → ${ruleTeam.team_name}.${note}`, source: "rule", needsReview: false };
  }
  return {
    teamId: dir.manualQueue?.id ?? null,
    teamName: dir.manualQueue?.team_name ?? null,
    reason: `No team is configured for "${category}"; sent to the manual review queue.`,
    source: "manual_review",
    needsReview: true,
  };
}

