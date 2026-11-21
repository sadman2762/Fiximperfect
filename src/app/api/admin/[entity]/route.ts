import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRoute, HttpError } from "@/lib/http";
import { requireStaff } from "@/lib/auth/session";
import { adminClient } from "@/lib/supabase/admin";
import { ADMIN_ENTITIES, type AdminEntity } from "@/lib/validations/admin";
import type { StaffProfile } from "@/types/domain";
import { firstFree, locationIdentifiers } from "@/lib/locations/identifiers";

type Ctx = { params: Promise<{ entity: string }> };

function entity(name: string) {
  if (!(name in ADMIN_ENTITIES)) throw new HttpError(404, "Unknown entity");
  return ADMIN_ENTITIES[name as AdminEntity];
}

async function audit(staff: StaffProfile, action: string, entityType: string, entityId: string | null, details: unknown) {
  await adminClient().from("audit_logs").insert({ actor_id: staff.id, actor_label: staff.full_name, action, entity_type: entityType, entity_id: entityId, details });
}

/**
 * Locations get their permanent QR identifiers here, once. Administrators never
 * type a slug, so labels cannot be broken by a typo or a later rename.
 */
async function prepareLocation(values: Record<string, unknown>) {
  const db = adminClient();
  const { data: building } = await db.from("buildings").select("code").eq("id", values.building_id as string).maybeSingle();
  if (!building) throw new HttpError(422, "Unknown building.");
  const room = (values.room_number as string | null) ?? null;
  const area = (values.area_name as string | null) ?? (room ? `Room ${room}` : null);
  if (!area) throw new HttpError(422, "Enter a room number or a name for the shared space.");
  const ids = locationIdentifiers({ buildingCode: building.code, floor: values.floor as number, roomNumber: room, areaName: area });
  const exists = (col: string) => async (v: string) => Boolean((await db.from("locations").select("id").eq(col, v).maybeSingle()).data);
  return {
    ...values,
    area_name: area,
    qr_slug: await firstFree(ids.qrSlug, exists("qr_slug")),
    location_code: await firstFree(ids.locationCode, exists("location_code")),
  };
}

function dbError(message: string): never {
  if (message.includes("duplicate key")) throw new HttpError(409, "A record with this code, name or QR slug already exists.");
  if (message.includes("foreign key")) throw new HttpError(409, "This record is still referenced by other records.");
  throw new HttpError(422, message);
}

export const POST = handleRoute(async (req: Request, ctx: Ctx) => {
  const staff = await requireStaff(["administrator"]);
  const e = entity((await ctx.params).entity);
  let values = e.schema.parse(await req.json()) as Record<string, unknown>;
  if (e.table === "locations") values = await prepareLocation(values);
  const { data, error } = await adminClient().from(e.table).insert(values).select("id").single();
  if (error) dbError(error.message);
  await audit(staff, "admin.create", e.table, data.id, values);
  return NextResponse.json({ id: data.id }, { status: 201 });
});

export const PATCH = handleRoute(async (req: Request, ctx: Ctx) => {
  const staff = await requireStaff(["administrator"]);
  const e = entity((await ctx.params).entity);
  const body = await req.json();
  const id = z.string().uuid().parse(body.id);
  const base = "innerType" in e.schema ? (e.schema as unknown as { innerType(): z.ZodObject }).innerType() : (e.schema as unknown as z.ZodObject);
  const values = base.partial().parse(body.values) as Record<string, unknown>;
  // QR identifiers are permanent: they are not part of the schema, and the
  // database rejects any change to locations.qr_slug as a second line of defence.
  delete values.qr_slug;
  delete values.location_code;
  if (e.table === "locations" && "area_name" in values && !values.area_name) {
    if (values.room_number) values.area_name = `Room ${values.room_number}`;
    else delete values.area_name;
  }
  const { error } = await adminClient().from(e.table).update(values).eq("id", id);
  if (error) dbError(error.message);
  await audit(staff, "admin.update", e.table, id, values);
  return NextResponse.json({ ok: true });
});

export const DELETE = handleRoute(async (req: Request, ctx: Ctx) => {
  const staff = await requireStaff(["administrator"]);
  const e = entity((await ctx.params).entity);
  const id = z.string().uuid().parse(new URL(req.url).searchParams.get("id"));
  const { error } = await adminClient().from(e.table).delete().eq("id", id);
  if (error) dbError(error.message);
  await audit(staff, "admin.delete", e.table, id, null);
  return NextResponse.json({ ok: true });
});
