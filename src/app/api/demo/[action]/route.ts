import { NextResponse } from "next/server";
import { handleRoute, HttpError } from "@/lib/http";
import { requireStaff } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { seedDemo } from "@/lib/demo/seed";
import * as scenarios from "@/lib/demo/scenarios";
import { runEscalationCheck } from "@/lib/workflows/emergency";
import { adminClient } from "@/lib/supabase/admin";

export const maxDuration = 120;

/** Demo control centre actions — administrator only, and only when demo tools are enabled. */
export const POST = handleRoute(async (_req: Request, ctx: { params: Promise<{ action: string }> }) => {
  await requireStaff(["administrator"]);
  if (env().DEMO_TOOLS_ENABLED !== "true") throw new HttpError(403, "Demo tools are disabled (DEMO_TOOLS_ENABLED=false).");
  const { action } = await ctx.params;
  switch (action) {
    case "reset":
      return NextResponse.json(await seedDemo());
    case "scenario-1":
      return NextResponse.json(await scenarios.scenarioDuplicateDetection());
    case "scenario-2":
      return NextResponse.json(await scenarios.scenarioSafetyEscalation());
    case "scenario-2-timeout": {
      const { data } = await adminClient().from("tickets").select("id").eq("escalation_status", "alerting").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!data) throw new HttpError(404, "No emergency is currently awaiting acknowledgement. Run scenario 2 first.");
      return NextResponse.json({ escalation: await scenarios.scenarioEscalationTimeout(data.id) });
    }
    case "scenario-3":
      return NextResponse.json(await scenarios.scenarioResolutionVerification());
    case "scenario-4":
      return NextResponse.json(await scenarios.scenarioPredictiveMaintenance());
    case "escalation-check":
      return NextResponse.json({ escalation: await runEscalationCheck() });
    default:
      throw new HttpError(404, "Unknown demo action");
  }
});

