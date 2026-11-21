import { NextResponse } from "next/server";
import { handleRoute, HttpError } from "@/lib/http";
import { requireStaff, canCoordinateTicket } from "@/lib/auth/session";
import { adminClient } from "@/lib/supabase/admin";
import { AssignmentSchema, CostSchema, MergeSchema, NoteSchema, PrioritySchema, StatusUpdateSchema } from "@/lib/validations/schemas";
import { addCost, addNote, assignTicket, changePriority, changeStatus, keepSeparate, mergeTickets } from "@/lib/tickets/service";
import { acknowledgeTicket } from "@/lib/workflows/emergency";

type Ctx = { params: Promise<{ id: string; action: string }> };

const UUID = /^[0-9a-f-]{36}$/i;

export const POST = handleRoute(async (req: Request, ctx: Ctx) => {
  const { id, action } = await ctx.params;
  if (!UUID.test(id)) throw new HttpError(404, "Ticket not found");
  const staff = await requireStaff(["caretaker", "maintenance_staff", "administrator"]);
  const body = req.headers.get("content-type")?.includes("application/json") ? await req.json() : {};

  switch (action) {
    case "status": {
      const v = StatusUpdateSchema.parse(body);
      return NextResponse.json(await changeStatus(staff, id, v.status, v.note, v.expectedStatus));
    }
    case "assign":
      return NextResponse.json(await assignTicket(staff, id, AssignmentSchema.parse(body)));
    case "priority": {
      const v = PrioritySchema.parse(body);
      return NextResponse.json(await changePriority(staff, id, v.priority, v.reason));
    }
    case "note":
      return NextResponse.json(await addNote(staff, id, NoteSchema.parse(body).note));
    case "cost":
      return NextResponse.json(await addCost(staff, id, CostSchema.parse(body)));
    case "merge":
      return NextResponse.json(await mergeTickets(staff, id, MergeSchema.parse(body).targetTicketId));
    case "keep-separate":
      return NextResponse.json(await keepSeparate(staff, id));
    case "acknowledge": {
      const { data: t } = await adminClient().from("tickets").select("building_id").eq("id", id).maybeSingle();
      if (!t) throw new HttpError(404, "Ticket not found");
      if (!canCoordinateTicket(staff, t)) throw new HttpError(403, "Only caretakers of this building can acknowledge");
      return NextResponse.json(await acknowledgeTicket(id, staff));
    }
    default:
      throw new HttpError(404, "Unknown action");
  }
});
