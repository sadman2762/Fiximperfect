import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRoute, HttpError } from "@/lib/http";
import { requireStaff } from "@/lib/auth/session";
import { adminClient } from "@/lib/supabase/admin";
import { StaffCreateSchema, StaffUpdateSchema } from "@/lib/validations/admin";

/** Staff accounts: Supabase Auth user + profile (role, building access, teams). */
export const POST = handleRoute(async (req: Request) => {
  const admin = await requireStaff(["administrator"]);
  const v = StaffCreateSchema.parse(await req.json());
  const db = adminClient();
  const { data, error } = await db.auth.admin.createUser({ email: v.email, password: v.password, email_confirm: true, user_metadata: { full_name: v.full_name } });
  if (error || !data.user) throw new HttpError(409, error?.message ?? "Could not create the account");
  const { error: pErr } = await db.from("profiles").insert({ id: data.user.id, email: v.email, full_name: v.full_name, role: v.role, phone: v.phone ?? null, building_access: v.building_access });
  if (pErr) {
    await db.auth.admin.deleteUser(data.user.id);
    throw new HttpError(422, pErr.message);
  }
  if (v.team_ids.length) await db.from("team_members").insert(v.team_ids.map((t) => ({ team_id: t, profile_id: data.user.id })));
  await db.from("audit_logs").insert({ actor_id: admin.id, actor_label: admin.full_name, action: "admin.staff_create", entity_type: "profile", entity_id: data.user.id, details: { email: v.email, role: v.role } });
  return NextResponse.json({ id: data.user.id }, { status: 201 });
});

export const PATCH = handleRoute(async (req: Request) => {
  const admin = await requireStaff(["administrator"]);
  const body = await req.json();
  const id = z.string().uuid().parse(body.id);
  const v = StaffUpdateSchema.parse(body.values);
  if (id === admin.id && (v.role && v.role !== "administrator" || v.is_active === false)) throw new HttpError(422, "You cannot remove your own administrator access.");
  const db = adminClient();
  const { team_ids, ...profile } = v;
  if (Object.keys(profile).length) {
    const { error } = await db.from("profiles").update(profile).eq("id", id);
    if (error) throw new HttpError(422, error.message);
  }
  if (team_ids) {
    await db.from("team_members").delete().eq("profile_id", id);
    if (team_ids.length) await db.from("team_members").insert(team_ids.map((t) => ({ team_id: t, profile_id: id })));
  }
  if (v.is_active === false) await db.auth.admin.updateUserById(id, { ban_duration: "876000h" });
  if (v.is_active === true) await db.auth.admin.updateUserById(id, { ban_duration: "none" });
  await db.from("audit_logs").insert({ actor_id: admin.id, actor_label: admin.full_name, action: "admin.staff_update", entity_type: "profile", entity_id: id, details: v });
  return NextResponse.json({ ok: true });
});

