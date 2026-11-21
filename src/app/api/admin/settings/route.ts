import { NextResponse } from "next/server";
import { handleRoute } from "@/lib/http";
import { requireStaff } from "@/lib/auth/session";
import { adminClient } from "@/lib/supabase/admin";
import { SettingsSchema } from "@/lib/validations/admin";

export const PATCH = handleRoute(async (req: Request) => {
  const admin = await requireStaff(["administrator"]);
  const body = await req.json();
  const values = SettingsSchema.parse(body?.values ?? body);
  const db = adminClient();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    await db.from("app_settings").update({ value, updated_at: new Date().toISOString(), updated_by: admin.id }).eq("key", key);
  }
  await db.from("audit_logs").insert({ actor_id: admin.id, actor_label: admin.full_name, action: "admin.settings", entity_type: "app_settings", details: values });
  return NextResponse.json({ ok: true });
});

