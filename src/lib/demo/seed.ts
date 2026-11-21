import "server-only";
import { adminClient } from "@/lib/supabase/admin";

/**
 * FICTIONAL DEMONSTRATION DATA. Every building, asset, cost and person here is
 * invented for the hackathon demo and flagged with is_demo = true. Phone numbers
 * use the UK Ofcom range reserved for fiction (+44 7700 900xxx) and emails use
 * the reserved .example domain, so no real person can be contacted.
 */

export const DEMO_PASSWORD = "Demo-Fiximperfect-2026!";

export const DEMO_STAFF = [
  { key: "caretaker", email: "caretaker@fiximperfect.example", full_name: "Dana Kovács (demo caretaker)", role: "caretaker", phone: "+447700900101", buildings: ["KOS-B", "KOS-A"] },
  { key: "caretaker2", email: "caretaker.riverside@fiximperfect.example", full_name: "Lena Novak (demo caretaker)", role: "caretaker", phone: "+447700900102", buildings: ["RIV"] },
  { key: "tech", email: "appliance.tech@fiximperfect.example", full_name: "Marco Rossi (demo appliance technician)", role: "maintenance_staff", phone: "+447700900103", buildings: ["KOS-B", "KOS-A", "RIV"] },
  { key: "plumber", email: "plumber@fiximperfect.example", full_name: "Aisha Okafor (demo plumber)", role: "maintenance_staff", phone: "+447700900104", buildings: ["KOS-B", "KOS-A", "RIV"] },
  { key: "admin", email: "admin@fiximperfect.example", full_name: "Sam Patel (demo administrator)", role: "administrator", phone: null, buildings: [] },
  { key: "manager", email: "manager@fiximperfect.example", full_name: "Jordan Weiss (demo facilities manager)", role: "management", phone: null, buildings: [] },
] as const;

const TEAMS = [
  { team_name: "Appliance Maintenance", description: "Washing machines, dryers, refrigerators and kitchen appliances.", responsible_categories: ["Laundry Equipment", "Kitchen Appliances"] },
  { team_name: "Plumbing", description: "Leaks, taps, toilets, showers and drains.", responsible_categories: ["Plumbing"] },
  { team_name: "HVAC", description: "Heating, radiators and ventilation.", responsible_categories: ["Heating"] },
  { team_name: "General Maintenance", description: "Furniture, doors, fixtures and anything else.", responsible_categories: ["Furniture", "General"] },
  { team_name: "IT Support", description: "Wi-Fi, network and connectivity.", responsible_categories: ["Internet"] },
  { team_name: "Electrical Maintenance / Emergency Review", description: "Electrical faults and safety hazards.", responsible_categories: ["Electrical"] },
  { team_name: "Manual Review Queue", description: "Tickets that could not be routed automatically.", responsible_categories: [], is_manual_review_queue: true },
];

const CATEGORIES: { name: string; team: string; priority: "low" | "medium" | "high" | "critical"; description: string }[] = [
  { name: "Laundry Equipment", team: "Appliance Maintenance", priority: "medium", description: "Washing machines and dryers" },
  { name: "Kitchen Appliances", team: "Appliance Maintenance", priority: "medium", description: "Refrigerators, ovens, hobs, microwaves" },
  { name: "Plumbing", team: "Plumbing", priority: "high", description: "Water leaks, taps, toilets, showers, drains" },
  { name: "Heating", team: "HVAC", priority: "high", description: "Heating and ventilation" },
  { name: "Furniture", team: "General Maintenance", priority: "low", description: "Beds, desks, chairs, wardrobes" },
  { name: "Internet", team: "IT Support", priority: "medium", description: "Wi-Fi and network" },
  { name: "Electrical", team: "Electrical Maintenance / Emergency Review", priority: "high", description: "Sockets, lighting, wiring, electrical hazards" },
  { name: "General", team: "General Maintenance", priority: "low", description: "Anything else" },
];

const BUILDINGS = [
  { code: "KOS-B", name: "Kossuth Dorm B", address: "12 Example Avenue (fictional)" },
  { code: "KOS-A", name: "Kossuth Dorm A", address: "10 Example Avenue (fictional)" },
  { code: "RIV", name: "Riverside Hall", address: "3 Sample Quay (fictional)" },
];

/** One QR code per room or shared space. `code` is the label printed under the QR. */
type Loc = { key: string; building: string; floor: number; area_name: string; room_number?: string; code: string; qr_slug: string; location_type: string };
const LOCATIONS: Loc[] = [
  { key: "kb-laundry2", building: "KOS-B", floor: 2, area_name: "Laundry Room", code: "KOS-B-F2-LAUNDRY", qr_slug: "kossuth-b-floor2-laundry", location_type: "laundry" },
  { key: "kb-kitchen2", building: "KOS-B", floor: 2, area_name: "Shared Kitchen", code: "KOS-B-F2-KITCHEN", qr_slug: "kossuth-b-floor2-kitchen", location_type: "kitchen" },
  { key: "kb-r204", building: "KOS-B", floor: 2, area_name: "Room 204", room_number: "204", code: "KOS-B-R204", qr_slug: "kossuth-b-room-204", location_type: "bedroom" },
  { key: "kb-r205", building: "KOS-B", floor: 2, area_name: "Room 205", room_number: "205", code: "KOS-B-R205", qr_slug: "kossuth-b-room-205", location_type: "bedroom" },
  { key: "kb-corridor1", building: "KOS-B", floor: 1, area_name: "Corridor East", code: "KOS-B-F1-CORRIDOR", qr_slug: "kossuth-b-floor1-corridor", location_type: "corridor" },
  { key: "kb-bath3", building: "KOS-B", floor: 3, area_name: "Shared Bathroom", code: "KOS-B-F3-BATHROOM", qr_slug: "kossuth-b-floor3-bathroom", location_type: "bathroom" },
  { key: "kb-common0", building: "KOS-B", floor: 0, area_name: "Common Room", code: "KOS-B-F0-COMMON", qr_slug: "kossuth-b-floor0-common", location_type: "common_room" },
  { key: "ka-laundry1", building: "KOS-A", floor: 1, area_name: "Laundry Room", code: "KOS-A-F1-LAUNDRY", qr_slug: "kossuth-a-floor1-laundry", location_type: "laundry" },
  { key: "ka-kitchen1", building: "KOS-A", floor: 1, area_name: "Shared Kitchen", code: "KOS-A-F1-KITCHEN", qr_slug: "kossuth-a-floor1-kitchen", location_type: "kitchen" },
  { key: "ka-r112", building: "KOS-A", floor: 1, area_name: "Room 112", room_number: "112", code: "KOS-A-R112", qr_slug: "kossuth-a-room-112", location_type: "bedroom" },
  { key: "ka-corridor2", building: "KOS-A", floor: 2, area_name: "Corridor", code: "KOS-A-F2-CORRIDOR", qr_slug: "kossuth-a-floor2-corridor", location_type: "corridor" },
  { key: "ri-kitchen0", building: "RIV", floor: 0, area_name: "Ground Floor Kitchen", code: "RIV-F0-KITCHEN", qr_slug: "riverside-floor0-kitchen", location_type: "kitchen" },
  { key: "ri-laundry1", building: "RIV", floor: 1, area_name: "Laundry Room", code: "RIV-F1-LAUNDRY", qr_slug: "riverside-floor1-laundry", location_type: "laundry" },
  { key: "ri-r101", building: "RIV", floor: 1, area_name: "Room 101", room_number: "101", code: "RIV-R101", qr_slug: "riverside-room-101", location_type: "bedroom" },
  { key: "ri-bath2", building: "RIV", floor: 2, area_name: "Bathroom Block", code: "RIV-F2-BATHROOM", qr_slug: "riverside-floor2-bathroom", location_type: "bathroom" },
];

type Asset = {
  code: string; name: string; category: string; loc: string; qr?: string; manufacturer: string; model: string;
  installed: string; cost: string; replacement: string; life: number; condition?: string;
};
const ASSETS: Asset[] = [
  { code: "WASHER-001", name: "Washer #1", category: "Laundry Equipment", loc: "kb-laundry2", manufacturer: "Lavex (fictional)", model: "LX-700", installed: "2023-03-01", cost: "420.00", replacement: "380.00", life: 8, condition: "poor" },
  { code: "WASHER-002", name: "Washer #2", category: "Laundry Equipment", loc: "kb-laundry2", manufacturer: "Lavex (fictional)", model: "LX-700", installed: "2023-03-01", cost: "420.00", replacement: "380.00", life: 8 },
  { code: "WASHER-003", name: "Washer #3", category: "Laundry Equipment", loc: "kb-laundry2", qr: "kossuth-b-floor2-washer03", manufacturer: "Lavex (fictional)", model: "LX-700", installed: "2023-03-01", cost: "420.00", replacement: "380.00", life: 8 },
  { code: "WASHER-004", name: "Washer #4", category: "Laundry Equipment", loc: "kb-laundry2", manufacturer: "Lavex (fictional)", model: "LX-900", installed: "2024-09-15", cost: "510.00", replacement: "460.00", life: 8 },
  { code: "DRYER-001", name: "Dryer #1", category: "Laundry Equipment", loc: "kb-laundry2", manufacturer: "Lavex (fictional)", model: "TD-300", installed: "2022-01-10", cost: "390.00", replacement: "350.00", life: 7 },
  { code: "FRIDGE-001", name: "Refrigerator #1", category: "Kitchen Appliances", loc: "kb-kitchen2", manufacturer: "Frostline (fictional)", model: "FL-320", installed: "2021-08-20", cost: "540.00", replacement: "499.00", life: 10 },
  { code: "OVEN-001", name: "Oven #1", category: "Kitchen Appliances", loc: "kb-kitchen2", manufacturer: "Cuisina (fictional)", model: "CU-60", installed: "2019-05-02", cost: "610.00", replacement: "580.00", life: 10 },
  { code: "FRIDGE-204", name: "Room 204 Mini Fridge", category: "Kitchen Appliances", loc: "kb-r204", manufacturer: "Frostline (fictional)", model: "FL-90", installed: "2022-08-20", cost: "190.00", replacement: "170.00", life: 8 },
  { code: "RADIATOR-204", name: "Room 204 Radiator", category: "Heating", loc: "kb-r204", manufacturer: "Thermique (fictional)", model: "R-60", installed: "2015-10-01", cost: "210.00", replacement: "240.00", life: 15 },
  { code: "ROUTER-KB0", name: "Wi-Fi Access Point (Common Room)", category: "Internet", loc: "kb-common0", manufacturer: "Netwave (fictional)", model: "AP-6", installed: "2022-09-01", cost: "180.00", replacement: "190.00", life: 5 },
  { code: "SHOWER-KB3", name: "Shower Unit 3A", category: "Plumbing", loc: "kb-bath3", manufacturer: "Aquaflow (fictional)", model: "S-12", installed: "2018-06-01", cost: "300.00", replacement: "320.00", life: 12 },
  { code: "WASHER-A01", name: "Washer A1", category: "Laundry Equipment", loc: "ka-laundry1", manufacturer: "Lavex (fictional)", model: "LX-700", installed: "2020-02-01", cost: "400.00", replacement: "380.00", life: 8 },
  { code: "FRIDGE-A01", name: "Refrigerator A1", category: "Kitchen Appliances", loc: "ka-kitchen1", manufacturer: "Frostline (fictional)", model: "FL-320", installed: "2017-04-11", cost: "520.00", replacement: "499.00", life: 10, condition: "fair" },
  { code: "RADIATOR-A2", name: "Corridor Radiator", category: "Heating", loc: "ka-corridor2", manufacturer: "Thermique (fictional)", model: "R-90", installed: "2012-10-01", cost: "250.00", replacement: "280.00", life: 15 },
  { code: "FRIDGE-R01", name: "Riverside Fridge 1", category: "Kitchen Appliances", loc: "ri-kitchen0", manufacturer: "Frostline (fictional)", model: "FL-400", installed: "2023-01-05", cost: "560.00", replacement: "520.00", life: 10 },
  { code: "WASHER-R01", name: "Riverside Washer 1", category: "Laundry Equipment", loc: "ri-laundry1", manufacturer: "Lavex (fictional)", model: "LX-900", installed: "2024-02-01", cost: "510.00", replacement: "460.00", life: 8 },
];

const DAY = 86_400_000;
const ago = (days: number, hours = 10) => new Date(Date.now() - days * DAY + (hours - 12) * 3_600_000).toISOString();

/** Historical tickets for analytics (fictional). `costs` are [parts, labour] in EUR. */
type Hist = {
  asset?: string; loc: string; category: string; title: string; reports: string[]; createdDaysAgo: number;
  resolvedAfterDays?: number; status: "closed" | "resolved" | "in_progress" | "assigned" | "waiting_for_parts";
  verified?: boolean; priority: "low" | "medium" | "high" | "critical"; costs?: [string, string][]; reopened?: number; safety?: "critical";
};
const HISTORY: Hist[] = [
  // Scenario 4: Washer #1 — four failures in 60 days, €420 repairs vs €380 replacement.
  { asset: "WASHER-001", loc: "kb-laundry2", category: "Laundry Equipment", title: "Washer #1: Drum not spinning", reports: ["Washer 1 stops mid-cycle and won't spin."], createdDaysAgo: 56, resolvedAfterDays: 2, status: "closed", verified: true, priority: "medium", costs: [["55.00", "40.00"]] },
  { asset: "WASHER-001", loc: "kb-laundry2", category: "Laundry Equipment", title: "Washer #1: Water not draining", reports: ["Water stays in washer 1 after the cycle.", "Washer 1 full of water again"], createdDaysAgo: 41, resolvedAfterDays: 1, status: "closed", verified: true, priority: "medium", costs: [["70.00", "40.00"]] },
  { asset: "WASHER-001", loc: "kb-laundry2", category: "Laundry Equipment", title: "Washer #1: Drum not spinning again", reports: ["Washer 1 isn't spinning again, same as last month."], createdDaysAgo: 25, resolvedAfterDays: 2, status: "closed", verified: false, priority: "medium", costs: [["65.00", "40.00"]], reopened: 1 },
  { asset: "WASHER-001", loc: "kb-laundry2", category: "Laundry Equipment", title: "Washer #1: Loud banging during spin", reports: ["Washer 1 is banging really loudly when spinning."], createdDaysAgo: 9, resolvedAfterDays: 1, status: "closed", verified: true, priority: "medium", costs: [["70.00", "40.00"]] },
  // Other history across buildings.
  { asset: "FRIDGE-001", loc: "kb-kitchen2", category: "Kitchen Appliances", title: "Refrigerator #1: Not cooling", reports: ["Fridge is warm, milk went off.", "Kitchen fridge not cold"], createdDaysAgo: 70, resolvedAfterDays: 3, status: "closed", verified: true, priority: "high", costs: [["85.00", "60.00"]] },
  { asset: "SHOWER-KB3", loc: "kb-bath3", category: "Plumbing", title: "Shower 3A: Leaking shower head", reports: ["Shower head in 3A leaks constantly."], createdDaysAgo: 48, resolvedAfterDays: 1, status: "closed", verified: true, priority: "medium", costs: [["18.50", "35.00"]] },
  { loc: "kb-bath3", category: "Plumbing", title: "Blocked sink drain", reports: ["Bathroom sink on floor 3 is blocked."], createdDaysAgo: 33, resolvedAfterDays: 1, status: "closed", verified: true, priority: "medium", costs: [["0.00", "30.00"]] },
  { asset: "ROUTER-KB0", loc: "kb-common0", category: "Internet", title: "Common room Wi-Fi dropping", reports: ["Wi-Fi in the common room keeps disconnecting.", "No internet downstairs", "Wifi super slow in common room"], createdDaysAgo: 20, resolvedAfterDays: 2, status: "closed", verified: true, priority: "medium" },
  { asset: "WASHER-A01", loc: "ka-laundry1", category: "Laundry Equipment", title: "Washer A1: Error code E21", reports: ["Washer shows E21 and stops."], createdDaysAgo: 62, resolvedAfterDays: 4, status: "closed", verified: true, priority: "medium", costs: [["120.00", "45.00"]] },
  { asset: "FRIDGE-A01", loc: "ka-kitchen1", category: "Kitchen Appliances", title: "Refrigerator A1: Freezer iced up", reports: ["Freezer compartment is a block of ice."], createdDaysAgo: 38, resolvedAfterDays: 2, status: "closed", verified: true, priority: "low", costs: [["0.00", "35.00"]] },
  { asset: "RADIATOR-A2", loc: "ka-corridor2", category: "Heating", title: "Corridor radiator cold", reports: ["Corridor radiator on floor 2 is ice cold.", "Heating not working in corridor"], createdDaysAgo: 15, resolvedAfterDays: 1, status: "resolved", verified: false, priority: "high", costs: [["40.00", "55.00"]] },
  { loc: "ka-corridor2", category: "Furniture", title: "Broken notice board", reports: ["Notice board fell off the wall."], createdDaysAgo: 12, status: "assigned", priority: "low" },
  { asset: "FRIDGE-R01", loc: "ri-kitchen0", category: "Kitchen Appliances", title: "Riverside Fridge 1: Door seal torn", reports: ["Fridge door seal is torn and doesn't close properly."], createdDaysAgo: 27, resolvedAfterDays: 6, status: "closed", verified: true, priority: "medium", costs: [["32.00", "25.00"]] },
  { asset: "WASHER-R01", loc: "ri-laundry1", category: "Laundry Equipment", title: "Riverside Washer 1: Coin slot jammed", reports: ["Card reader on the washer is not accepting payment."], createdDaysAgo: 6, status: "waiting_for_parts", priority: "medium" },
  { loc: "ri-bath2", category: "Plumbing", title: "Toilet running continuously", reports: ["Toilet in the 2nd floor block never stops running.", "Toilet constantly filling"], createdDaysAgo: 4, status: "in_progress", priority: "medium" },
  { loc: "ri-bath2", category: "Electrical", title: "Flickering bathroom light", reports: ["Light in the bathroom block flickers on and off."], createdDaysAgo: 80, resolvedAfterDays: 1, status: "closed", verified: true, priority: "medium", costs: [["12.00", "30.00"]] },
];

const STUDENTS = ["Alex Fischer", "Bea Horváth", "Chris Nagy", "Dora Szabó", "Emil Varga", "Fanni Tóth", "Gabor Kiss", "Hanna Molnár", "Ivan Papp", "Julia Farkas"];
const studentEmail = (name: string) => `${name.toLowerCase().normalize("NFD").replace(/[^a-z ]/g, "").replace(/ /g, ".")}@students.fiximperfect.example`;

async function ensureStaff() {
  const db = adminClient();
  const ids: Record<string, string> = {};
  const { data: list } = await db.auth.admin.listUsers({ perPage: 200 });
  for (const s of DEMO_STAFF) {
    let user = list?.users.find((u) => u.email === s.email);
    if (!user) {
      const { data, error } = await db.auth.admin.createUser({ email: s.email, password: DEMO_PASSWORD, email_confirm: true, user_metadata: { full_name: s.full_name, demo: true } });
      if (error || !data.user) throw new Error(`create user ${s.email}: ${error?.message}`);
      user = data.user;
    } else {
      await db.auth.admin.updateUserById(user.id, { password: DEMO_PASSWORD });
    }
    ids[s.key] = user.id;
  }
  return ids;
}

export async function seedDemo() {
  const db = adminClient();
  const reset = await db.rpc("demo_reset");
  if (reset.error) throw new Error(`demo_reset failed: ${reset.error.message}`);

  const staffIds = await ensureStaff();

  // Teams and categories (shared reference data — upserted, not demo-flagged).
  const { data: teams, error: teamErr } = await db
    .from("maintenance_teams")
    .upsert(TEAMS.map((t) => ({ is_manual_review_queue: false, ...t })), { onConflict: "team_name" }).select("id, team_name");
  if (teamErr) throw new Error(teamErr.message);
  const teamId = (name: string) => teams!.find((t) => t.team_name === name)!.id as string;
  const { data: cats, error: catErr } = await db
    .from("categories")
    .upsert(CATEGORIES.map((c) => ({ name: c.name, description: c.description, default_team_id: teamId(c.team), default_priority: c.priority })), { onConflict: "name" })
    .select("id, name");
  if (catErr) throw new Error(catErr.message);

  const { data: buildings, error: bErr } = await db.from("buildings").insert(BUILDINGS.map((b) => ({ ...b, is_demo: true }))).select("id, code, name");
  if (bErr) throw new Error(bErr.message);
  const bId = (code: string) => buildings!.find((b) => b.code === code)!.id as string;

  const { data: locs, error: lErr } = await db
    .from("locations")
    .insert(LOCATIONS.map((l) => ({ building_id: bId(l.building), floor: l.floor, area_name: l.area_name, room_number: l.room_number ?? null, location_code: l.code, qr_slug: l.qr_slug, location_type: l.location_type, is_demo: true })))
    .select("id, qr_slug, building_id");
  if (lErr) throw new Error(lErr.message);
  const locByKey = (key: string) => locs!.find((x) => x.qr_slug === LOCATIONS.find((l) => l.key === key)!.qr_slug)!;

  const { data: assets, error: aErr } = await db
    .from("assets")
    .insert(
      ASSETS.map((a) => {
        const loc = locByKey(a.loc);
        return {
          asset_code: a.code, asset_name: a.name, category: a.category, manufacturer: a.manufacturer, model: a.model,
          building_id: loc.building_id, location_id: loc.id, qr_slug: a.qr ?? null, installation_date: a.installed, purchase_date: a.installed,
          purchase_cost: a.cost, replacement_cost: a.replacement, currency: "EUR", expected_useful_life_years: a.life,
          condition: a.condition ?? "good", is_demo: true,
        };
      }),
    )
    .select("id, asset_code, building_id, location_id");
  if (aErr) throw new Error(aErr.message);

  // Staff profiles.
  const allBuildings = buildings!.map((b) => b.id as string);
  await db.from("profiles").upsert(
    DEMO_STAFF.map((s) => ({
      id: staffIds[s.key], full_name: s.full_name, email: s.email, phone: s.phone, role: s.role,
      building_access: s.role === "administrator" || s.role === "management" ? allBuildings : s.buildings.map(bId), is_active: true,
    })),
  );
  await db.from("team_members").upsert([
    { team_id: teamId("Appliance Maintenance"), profile_id: staffIds.tech },
    { team_id: teamId("Plumbing"), profile_id: staffIds.plumber },
  ]);

  // Emergency contacts per building (fictional numbers).
  await db.from("emergency_contacts").insert([
    { building_id: bId("KOS-B"), contact_role: "primary_caretaker", escalation_order: 1, name: "Dana Kovács (demo)", phone: "+447700900101", email: "caretaker@fiximperfect.example", profile_id: staffIds.caretaker },
    { building_id: bId("KOS-B"), contact_role: "secondary_caretaker", escalation_order: 2, name: "Night caretaker (demo)", phone: "+447700900111", email: "night.caretaker@fiximperfect.example" },
    { building_id: bId("KOS-B"), contact_role: "backup_maintenance", escalation_order: 3, name: "On-call electrician (demo)", phone: "+447700900112", email: "oncall.electric@fiximperfect.example" },
    { building_id: bId("KOS-A"), contact_role: "primary_caretaker", escalation_order: 1, name: "Dana Kovács (demo)", phone: "+447700900101", email: "caretaker@fiximperfect.example", profile_id: staffIds.caretaker },
    { building_id: bId("KOS-A"), contact_role: "backup_maintenance", escalation_order: 2, name: "On-call electrician (demo)", phone: "+447700900112", email: "oncall.electric@fiximperfect.example" },
    { building_id: bId("RIV"), contact_role: "primary_caretaker", escalation_order: 1, name: "Lena Novak (demo)", phone: "+447700900102", email: "caretaker.riverside@fiximperfect.example", profile_id: staffIds.caretaker2 },
    { building_id: bId("RIV"), contact_role: "backup_maintenance", escalation_order: 2, name: "On-call electrician (demo)", phone: "+447700900112", email: "oncall.electric@fiximperfect.example" },
  ]);

  // Historical tickets, reports, events and costs.
  let studentIdx = 0;
  for (const h of HISTORY) {
    const loc = locByKey(h.loc);
    const asset = h.asset ? assets!.find((a) => a.asset_code === h.asset)! : null;
    const created = ago(h.createdDaysAgo);
    const resolvedAt = h.resolvedAfterDays !== undefined ? new Date(new Date(created).getTime() + h.resolvedAfterDays * DAY).toISOString() : null;
    const team = teamId(CATEGORIES.find((c) => c.name === h.category)!.team);
    const { data: ticket, error } = await db
      .from("tickets")
      .insert({
        building_id: loc.building_id, location_id: loc.id, asset_id: asset?.id ?? null, category: h.category, title: h.title,
        description: h.reports[0], priority: h.priority, priority_reason: "Seeded demo history.", status: h.status,
        assigned_team_id: team, routing_reason: "Seeded demo history.", resolved_at: resolvedAt,
        resolution_verified: Boolean(h.verified && resolvedAt), verified_at: h.verified && resolvedAt ? resolvedAt : null,
        closed_at: h.status === "closed" ? resolvedAt : null, reopened_count: h.reopened ?? 0, ai_mode: "mock", is_demo: true,
        created_at: created,
      })
      .select("id")
      .single();
    if (error || !ticket) throw new Error(`seed ticket: ${error?.message}`);

    const reportIds: string[] = [];
    for (const [i, text] of h.reports.entries()) {
      const name = STUDENTS[studentIdx++ % STUDENTS.length];
      const { data: rep } = await db
        .from("reports")
        .insert({
          ticket_id: ticket.id, location_id: loc.id, asset_id: asset?.id ?? null, reporter_name: name, reporter_email: studentEmail(name),
          description: text, tracking_token_hash: `seed-${crypto.randomUUID()}`, processing_status: "processed",
          link_status: i === 0 ? "new_ticket" : "auto_linked", duplicate_confidence: i === 0 ? null : 0.91,
          ai_analysis: { mode: "mock", seeded: true, note: "Fictional seeded history — not an AI decision." },
          is_demo: true, created_at: new Date(new Date(created).getTime() + i * 3_600_000).toISOString(),
        })
        .select("id")
        .single();
      if (rep) reportIds.push(rep.id);
    }

    const events: Record<string, unknown>[] = [
      { ticket_id: ticket.id, actor_label: "Seed data", event_type: "ticket_created", new_value: "submitted", created_at: created },
      { ticket_id: ticket.id, actor_label: "Seed data", event_type: "status_changed", old_value: "submitted", new_value: "assigned", created_at: created },
    ];
    if (resolvedAt) {
      events.push({ ticket_id: ticket.id, actor_label: "Seed data", event_type: "status_changed", old_value: "in_progress", new_value: "resolved", created_at: resolvedAt });
      if (h.reopened) {
        events.push({ ticket_id: ticket.id, actor_label: "Seed data", event_type: "status_changed", old_value: "resolved", new_value: "reopened", created_at: new Date(new Date(resolvedAt).getTime() + 3_600_000).toISOString() });
      }
      if (h.status === "closed") events.push({ ticket_id: ticket.id, actor_label: "Seed data", event_type: "status_changed", old_value: "resolved", new_value: "closed", created_at: new Date(new Date(resolvedAt).getTime() + 7_200_000).toISOString() });
    } else if (h.status !== "assigned") {
      events.push({ ticket_id: ticket.id, actor_label: "Seed data", event_type: "status_changed", old_value: "assigned", new_value: h.status, created_at: ago(h.createdDaysAgo - 1) });
    }
    await db.from("ticket_events").insert(events);

    for (const [parts, labour] of h.costs ?? []) {
      await db.from("maintenance_costs").insert({
        ticket_id: ticket.id, asset_id: asset?.id ?? null, parts_cost: parts, labour_cost: labour, other_cost: "0.00", currency: "EUR",
        expense_date: (resolvedAt ?? created).slice(0, 10), notes: "Fictional demo expense.", recorded_by: staffIds.tech, is_demo: true,
      });
    }
  }

  return {
    buildings: buildings!.length,
    locations: locs!.length,
    assets: assets!.length,
    historicalTickets: HISTORY.length,
    staff: DEMO_STAFF.map((s) => ({ email: s.email, role: s.role })),
    categories: cats!.length,
  };
}

