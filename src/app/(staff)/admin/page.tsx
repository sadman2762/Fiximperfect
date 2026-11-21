import Link from "next/link";
import type { Metadata } from "next";
import QRCode from "qrcode";
import { requireStaffPage } from "@/lib/auth/session";
import { sessionClient } from "@/lib/supabase/server";
import { appUrl, env, providerStatus } from "@/lib/env";
import { PageHeader, formatDate } from "@/components/shared/ui-bits";
import { DeliveryBadge } from "@/components/shared/badges";
import { EntityForm, DeleteButton, EditToggle, type Field } from "@/components/admin/entity-form";
import { DemoControls } from "@/components/admin/demo-controls";
import { SETTING_BOUNDS, loadSettings } from "@/lib/settings";
import { DEMO_PASSWORD, DEMO_STAFF } from "@/lib/demo/seed";
import { floorAndPlace, placeName } from "@/lib/locations/label";

export const metadata: Metadata = { title: "Administration" };

const TABS = [
  ["demo", "Demo centre"],
  ["buildings", "Buildings & locations"],
  ["assets", "Assets"],
  ["qr", "QR codes"],
  ["teams", "Teams & routing"],
  ["staff", "Staff & roles"],
  ["contacts", "Emergency contacts"],
  ["settings", "Settings"],
  ["outbox", "Notifications"],
  ["audit", "Audit log"],
] as const;

const SETTING_LABELS: Record<string, string> = {
  duplicate_auto_link_threshold: "Duplicate auto-link confidence (0–1)",
  duplicate_review_threshold: "Duplicate review confidence (0–1)",
  duplicate_window_days: "Duplicate search window (days)",
  classification_review_threshold: "Classification review below confidence (0–1)",
  emergency_ack_timeout_minutes: "Emergency acknowledgement timeout (minutes)",
  replacement_failure_threshold: "Replacement review: failures in window",
  replacement_window_days: "Replacement review: window (days)",
  replacement_cost_ratio_threshold: "Replacement review: repair ÷ replacement (%)",
  feedback_token_ttl_days: "Feedback link validity (days)",
  backlog_alert_threshold: "Backlog alert: open tickets per building",
};

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-card p-5 surface">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireStaffPage(["administrator"]);
  const tab = (await searchParams).tab ?? "demo";
  const db = await sessionClient();
  const [{ data: buildings }, { data: locations }, { data: teams }, { data: categories }] = await Promise.all([
    db.from("buildings").select("id, name, code, address, is_demo").order("name"),
    db.from("locations").select("id, building_id, floor, area_name, room_number, location_code, qr_slug, location_type").order("floor").order("area_name"),
    db.from("maintenance_teams").select("id, team_name, description, responsible_categories, is_manual_review_queue").order("team_name"),
    db.from("categories").select("id, name, description, default_team_id, default_priority").order("name"),
  ]);
  const bOpts = (buildings ?? []).map((b) => ({ value: b.id, label: b.name }));
  const lOpts = (locations ?? []).map((l) => ({ value: l.id, label: `${(buildings ?? []).find((b) => b.id === l.building_id)?.code} · ${floorAndPlace(l)}` }));
  const tOpts = (teams ?? []).map((t) => ({ value: t.id, label: t.team_name }));
  const cOpts = (categories ?? []).map((c) => ({ value: c.name, label: c.name }));
  const prov = providerStatus();

  let body: React.ReactNode = null;

  if (tab === "demo") {
    body = (
      <div className="space-y-4">
        <Box title="Integration status">
          <ul className="grid gap-2 text-sm sm:grid-cols-3">
            <li>AI agents: <strong>{prov.ai === "live" ? `Live Claude (${env().ANTHROPIC_MODEL ?? "claude-opus-5-5"})` : prov.ai === "mock" ? "Mock fixtures (AI_MODE=mock)" : "AI_MODE=live but no API key"}</strong></li>
            <li>Email (Resend): <strong>{prov.email}</strong></li>
            <li>SMS & voice (Twilio): <strong>{prov.sms}</strong></li>
          </ul>
        </Box>
        <Box title="Demonstration scenarios">
          <p className="mb-3 text-xs text-muted-foreground">
            Each button runs the real workflow services against the database. All demo records are fictional and flagged as demo data. Demo staff password: <code>{DEMO_PASSWORD}</code>
          </p>
          <DemoControls />
          <div className="mt-4 text-xs text-muted-foreground">
            Demo accounts: {DEMO_STAFF.map((s) => `${s.email} (${s.role})`).join(" · ")}
          </div>
          <div className="mt-2 text-xs">
            Student QR pages: <Link className="text-[#0071e3] underline" href="/report/kossuth-b-floor2-laundry">Kossuth B laundry room</Link> ·{" "}
            <Link className="text-[#0071e3] underline" href="/report/kossuth-b-room-204">Kossuth B room 204</Link> ·{" "}
            <Link className="text-[#0071e3] underline" href="/report/kossuth-b-floor1-corridor">Kossuth B corridor</Link>
          </div>
        </Box>
      </div>
    );
  } else if (tab === "buildings") {
    const bFields: Field[] = [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "code", label: "Code", type: "text", required: true, placeholder: "KOS-B" },
      { name: "address", label: "Address", type: "text" },
    ];
    const lFields: Field[] = [
      { name: "building_id", label: "Building", type: "select", options: bOpts, required: true },
      { name: "floor", label: "Floor", type: "number", required: true },
      { name: "room_number", label: "Room number (rooms only)", type: "text", placeholder: "204" },
      { name: "area_name", label: "Name (shared spaces, optional for rooms)", type: "text", placeholder: "Laundry Room" },
      { name: "location_type", label: "Type", type: "select", options: ["laundry", "kitchen", "corridor", "bathroom", "common_room", "bedroom", "technical", "other"].map((x) => ({ value: x, label: x })), required: true },
    ];
    body = (
      <div className="space-y-4">
        <Box title="Add building">
          <EntityForm endpoint="/api/admin/buildings" fields={bFields} />
        </Box>
        <Box title="Add location">
          <EntityForm endpoint="/api/admin/locations" fields={lFields} />
        </Box>
        <p className="text-xs text-muted-foreground">
          Every room or shared space gets one permanent QR code, generated when it is created. Renaming a room or replacing its equipment never changes the code, so
          printed labels keep working.
        </p>
        {(buildings ?? []).map((b) => {
          const locs = (locations ?? []).filter((l) => l.building_id === b.id);
          const floors = [...new Set(locs.map((l) => l.floor))].sort((x, y) => x - y);
          return (
            <Box key={b.id} title={`${b.name} (${b.code})${b.is_demo ? " · demo" : ""}`}>
              {floors.length === 0 ? <p className="text-sm text-muted-foreground">No locations yet.</p> : null}
              {floors.map((f) => (
                <div key={f} className="mb-3 last:mb-0">
                  <h3 className="text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase">Floor {f}</h3>
                  <ul className="divide-y text-sm">
                    {locs.filter((l) => l.floor === f).map((l) => (
                      <li key={l.id} className="py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>
                            <strong className="font-medium">{placeName(l)}</strong>
                            {l.room_number && l.area_name !== placeName(l) ? <span className="text-muted-foreground"> · {l.area_name}</span> : null} ·{" "}
                            <span className="text-muted-foreground">{l.location_type.replace("_", " ")}</span>{" "}
                            <span className="font-mono text-xs text-muted-foreground">{l.location_code}</span>
                          </span>
                          <span className="flex items-center gap-3 text-xs">
                            <Link className="text-[#0071e3] underline" href={`/admin?tab=qr#qr-${l.qr_slug}`}>QR code</Link>
                            <DeleteButton endpoint="/api/admin/locations" id={l.id} />
                          </span>
                        </div>
                        <EditToggle>
                          <EntityForm
                            endpoint="/api/admin/locations"
                            id={l.id}
                            submitLabel="Save (QR code stays the same)"
                            fields={lFields.filter((x) => x.name !== "building_id")}
                            initial={{ floor: String(l.floor), room_number: l.room_number ?? "", area_name: l.area_name, location_type: l.location_type }}
                          />
                        </EditToggle>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </Box>
          );
        })}
      </div>
    );
  } else if (tab === "assets") {
    const { data: assets } = await db.from("assets").select("*").order("asset_code");
    const aFields: Field[] = [
      { name: "asset_code", label: "Asset ID", type: "text", required: true, placeholder: "WASHER-005" },
      { name: "asset_name", label: "Name", type: "text", required: true },
      { name: "category", label: "Category", type: "select", options: cOpts, required: true },
      { name: "building_id", label: "Building", type: "select", options: bOpts, required: true },
      { name: "location_id", label: "Location", type: "select", options: lOpts, required: true },
      { name: "manufacturer", label: "Manufacturer", type: "text" },
      { name: "model", label: "Model", type: "text" },
      { name: "installation_date", label: "Installed", type: "date" },
      { name: "purchase_date", label: "Purchased", type: "date" },
      { name: "purchase_cost", label: "Purchase cost", type: "text" },
      { name: "replacement_cost", label: "Replacement cost", type: "text" },
      { name: "currency", label: "Currency", type: "text" },
      { name: "expected_useful_life_years", label: "Useful life (years)", type: "number" },
      { name: "condition", label: "Condition", type: "select", options: ["new", "good", "fair", "poor", "critical"].map((x) => ({ value: x, label: x })) },
      { name: "operational_status", label: "Status", type: "select", options: ["operational", "degraded", "out_of_service", "retired"].map((x) => ({ value: x, label: x })) },
    ];
    body = (
      <div className="space-y-4">
        <Box title="Register asset">
          <EntityForm endpoint="/api/admin/assets" fields={aFields} initial={{ currency: "EUR", condition: "good", operational_status: "operational" }} />
        </Box>
        <Box title="Asset registry">
          <ul className="divide-y text-sm">
            {(assets ?? []).map((a) => (
              <li key={a.id} className="py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <Link href={`/assets/${a.id}`} className="font-medium text-[#0071e3] hover:underline">{a.asset_name}</Link>{" "}
                    <span className="font-mono text-xs text-muted-foreground">{a.asset_code}</span> · {a.category} · {lOpts.find((o) => o.value === a.location_id)?.label ?? "—"} · replacement {a.replacement_cost ?? "—"} {a.currency} · {a.operational_status}
                  </span>
                  <span className="flex gap-3">
                    <DeleteButton endpoint="/api/admin/assets" id={a.id} />
                  </span>
                </div>
                <EditToggle>
                  <EntityForm
                      endpoint="/api/admin/assets"
                      id={a.id}
                      submitLabel="Save"
                     
                      fields={aFields}
                      initial={Object.fromEntries(aFields.map((f) => [f.name, a[f.name] === null || a[f.name] === undefined ? "" : String(a[f.name])]))}
                    />
                </EditToggle>
              </li>
            ))}
          </ul>
        </Box>
      </div>
    );
  } else if (tab === "qr") {
    const bById = new Map((buildings ?? []).map((x) => [x.id, x]));
    const items = (locations ?? [])
      .slice()
      .sort((x, y) => (bById.get(x.building_id)?.name ?? "").localeCompare(bById.get(y.building_id)?.name ?? "") || x.floor - y.floor || placeName(x).localeCompare(placeName(y)))
      .map((l) => ({ slug: l.qr_slug, code: l.location_code, title: placeName(l), sub: `${bById.get(l.building_id)?.name} · Floor ${l.floor}` }));
    const svgs = await Promise.all(items.map((i) => QRCode.toString(appUrl(`/report/${i.slug}`), { type: "svg", margin: 1 })));
    body = (
      <Box title="QR codes — one per room or shared space">
        <p className="mb-3 text-xs text-muted-foreground">
          Each code opens the report page for its location. Students then say what is wrong (washer, fridge, heating…), so one code covers all the equipment in the room.
          Codes are permanent: renaming the room or replacing equipment does not change them.{" "}
          <Link href="/admin/qr-labels" className="text-[#0071e3] underline">Open printable label sheet</Link>
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((i, idx) => (
            <div key={i.slug} id={`qr-${i.slug}`} className="scroll-mt-24 rounded-xl border p-2 text-center target:border-[#0071e3] target:ring-4 target:ring-[#0071e3]/20">
              <div className="mx-auto w-28" dangerouslySetInnerHTML={{ __html: svgs[idx] }} />
              <p className="mt-1 text-xs font-medium">{i.title}</p>
              <p className="text-[11px] text-muted-foreground">{i.sub}</p>
              <p className="font-mono text-[10px] text-muted-foreground">{i.code}</p>
              <div className="mt-1 flex justify-center gap-2 text-[11px]">
                <a className="text-[#0071e3] underline" href={`/api/qr/${i.slug}?format=png`}>PNG</a>
                <a className="text-[#0071e3] underline" href={`/api/qr/${i.slug}`} target="_blank" rel="noreferrer">SVG</a>
                <Link className="text-[#0071e3] underline" href={`/report/${i.slug}`}>Preview</Link>
              </div>
            </div>
          ))}
        </div>
      </Box>
    );
  } else if (tab === "teams") {
    const { data: rules } = await db.from("routing_rules").select("id, category_id, building_id, team_id");
    body = (
      <div className="space-y-4">
        <Box title="Add maintenance team">
          <EntityForm
            endpoint="/api/admin/teams"
            fields={[
              { name: "team_name", label: "Team name", type: "text", required: true },
              { name: "description", label: "Description", type: "text" },
              { name: "responsible_categories", label: "Responsible categories (comma-separated)", type: "list" },
              { name: "is_manual_review_queue", label: "Manual review queue", type: "checkbox" },
            ]}
          />
        </Box>
        <Box title="Teams">
          <ul className="divide-y text-sm">
            {(teams ?? []).map((t) => (
              <li key={t.id} className="py-2">
                <div className="flex justify-between gap-2">
                  <span><strong>{t.team_name}</strong> — {(t.responsible_categories as string[]).join(", ") || (t.is_manual_review_queue ? "manual review queue" : "no categories")}</span>
                  <DeleteButton endpoint="/api/admin/teams" id={t.id} />
                </div>
                <EditToggle>
                  <EntityForm endpoint="/api/admin/teams" id={t.id} submitLabel="Save"
                      fields={[
                        { name: "team_name", label: "Team name", type: "text" },
                        { name: "description", label: "Description", type: "text" },
                        { name: "responsible_categories", label: "Responsible categories", type: "list" },
                      ]}
                      initial={{ team_name: t.team_name, description: t.description ?? "", responsible_categories: (t.responsible_categories as string[]).join(", ") }}
                    />
                </EditToggle>
              </li>
            ))}
          </ul>
        </Box>
        <Box title="Categories & default routing">
          <EntityForm
            endpoint="/api/admin/categories"
            fields={[
              { name: "name", label: "Category", type: "text", required: true },
              { name: "description", label: "Description", type: "text" },
              { name: "default_team_id", label: "Default team", type: "select", options: tOpts },
              { name: "default_priority", label: "Default priority", type: "select", options: ["low", "medium", "high", "critical"].map((x) => ({ value: x, label: x })) },
            ]}
            initial={{ default_priority: "medium" }}
          />
          <ul className="mt-3 divide-y text-sm">
            {(categories ?? []).map((c) => (
              <li key={c.id} className="flex justify-between gap-2 py-2">
                <span><strong>{c.name}</strong> → {(teams ?? []).find((t) => t.id === c.default_team_id)?.team_name ?? "manual review"} · default {c.default_priority}</span>
                <DeleteButton endpoint="/api/admin/categories" id={c.id} />
              </li>
            ))}
          </ul>
        </Box>
        <Box title="Building-specific routing overrides">
          <EntityForm
            endpoint="/api/admin/routing_rules"
            fields={[
              { name: "category_id", label: "Category", type: "select", options: (categories ?? []).map((c) => ({ value: c.id, label: c.name })), required: true },
              { name: "building_id", label: "Building (empty = all)", type: "select", options: bOpts },
              { name: "team_id", label: "Team", type: "select", options: tOpts, required: true },
            ]}
            submitLabel="Add override"
          />
          <ul className="mt-3 divide-y text-sm">
            {(rules ?? []).map((r) => (
              <li key={r.id} className="flex justify-between gap-2 py-2">
                <span>
                  {(categories ?? []).find((c) => c.id === r.category_id)?.name} in {(buildings ?? []).find((b) => b.id === r.building_id)?.name ?? "all buildings"} → {(teams ?? []).find((t) => t.id === r.team_id)?.team_name}
                </span>
                <DeleteButton endpoint="/api/admin/routing_rules" id={r.id} />
              </li>
            ))}
          </ul>
        </Box>
      </div>
    );
  } else if (tab === "staff") {
    const [{ data: staff }, { data: members }] = await Promise.all([
      db.from("profiles").select("id, full_name, email, phone, role, building_access, is_active").order("full_name"),
      db.from("team_members").select("team_id, profile_id"),
    ]);
    const roleOpts = ["caretaker", "maintenance_staff", "administrator", "management"].map((x) => ({ value: x, label: x.replace("_", " ") }));
    body = (
      <div className="space-y-4">
        <Box title="Create staff account">
          <EntityForm
            endpoint="/api/admin/staff"
            fields={[
              { name: "full_name", label: "Full name", type: "text", required: true },
              { name: "email", label: "Email", type: "email", required: true },
              { name: "password", label: "Initial password (≥12 chars)", type: "password", required: true },
              { name: "role", label: "Role", type: "select", options: roleOpts, required: true },
              { name: "phone", label: "Phone (E.164)", type: "text" },
              { name: "building_access", label: "Building access", type: "multi", options: bOpts },
              { name: "team_ids", label: "Teams", type: "multi", options: tOpts },
            ]}
          />
        </Box>
        <Box title="Staff">
          <ul className="divide-y text-sm">
            {(staff ?? []).map((s) => (
              <li key={s.id} className="py-2">
                <p>
                  <strong>{s.full_name}</strong> <span className="text-muted-foreground">{s.email}</span> · {s.role.replace("_", " ")} {s.is_active ? "" : "· deactivated"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Buildings: {(s.building_access as string[]).map((b) => (buildings ?? []).find((x) => x.id === b)?.code).filter(Boolean).join(", ") || "none"} · Teams:{" "}
                  {(members ?? []).filter((m) => m.profile_id === s.id).map((m) => (teams ?? []).find((t) => t.id === m.team_id)?.team_name).join(", ") || "none"}
                </p>
                <EditToggle label="Edit role & access">
                  <EntityForm
                      endpoint="/api/admin/staff"
                      id={s.id}
                      submitLabel="Save"
                     
                      fields={[
                        { name: "role", label: "Role", type: "select", options: roleOpts },
                        { name: "phone", label: "Phone", type: "text" },
                        { name: "is_active", label: "Active", type: "checkbox" },
                        { name: "building_access", label: "Building access", type: "multi", options: bOpts },
                        { name: "team_ids", label: "Teams", type: "multi", options: tOpts },
                      ]}
                      initial={{
                        role: s.role,
                        phone: s.phone ?? "",
                        is_active: s.is_active,
                        building_access: s.building_access as string[],
                        team_ids: (members ?? []).filter((m) => m.profile_id === s.id).map((m) => m.team_id as string),
                      }}
                    />
                </EditToggle>
              </li>
            ))}
          </ul>
        </Box>
      </div>
    );
  } else if (tab === "contacts") {
    const { data: contacts } = await db.from("emergency_contacts").select("*").order("escalation_order");
    body = (
      <div className="space-y-4">
        <Box title="Add emergency contact">
          <EntityForm
            endpoint="/api/admin/contacts"
            fields={[
              { name: "building_id", label: "Building", type: "select", options: bOpts, required: true },
              { name: "contact_role", label: "Role", type: "select", options: [{ value: "primary_caretaker", label: "Primary caretaker" }, { value: "secondary_caretaker", label: "Secondary caretaker" }, { value: "backup_maintenance", label: "Backup maintenance" }], required: true },
              { name: "escalation_order", label: "Escalation order (1 = first)", type: "number", required: true },
              { name: "name", label: "Name", type: "text", required: true },
              { name: "phone", label: "Phone (E.164, for SMS & voice)", type: "text" },
              { name: "email", label: "Email", type: "email" },
            ]}
          />
        </Box>
        {(buildings ?? []).map((b) => (
          <Box key={b.id} title={`${b.name} — escalation chain`}>
            <ol className="space-y-1 text-sm">
              {(contacts ?? []).filter((c) => c.building_id === b.id).map((c) => (
                <li key={c.id} className="flex justify-between gap-2">
                  <span>
                    {c.escalation_order}. {c.name} ({c.contact_role.replace(/_/g, " ")}) · {c.phone ?? "no phone"} · {c.email ?? "no email"}
                  </span>
                  <DeleteButton endpoint="/api/admin/contacts" id={c.id} />
                </li>
              ))}
            </ol>
          </Box>
        ))}
      </div>
    );
  } else if (tab === "settings") {
    const s = await loadSettings(db);
    body = (
      <Box title="Thresholds & escalation settings">
        <EntityForm
          endpoint="/api/admin/settings"
          id="settings"
          submitLabel="Save settings"
          fields={(Object.keys(SETTING_BOUNDS) as (keyof typeof SETTING_BOUNDS)[]).map((k) => ({ name: k, label: `${SETTING_LABELS[k]} [${SETTING_BOUNDS[k][0]}–${SETTING_BOUNDS[k][1]}]`, type: "number" as const }))}
          initial={Object.fromEntries(Object.entries(s).map(([k, v]) => [k, String(v)]))}
        />
        <p className="mt-3 text-xs text-muted-foreground">Notification providers are configured with environment variables (see README). Current: email {prov.email}, SMS/voice {prov.sms}.</p>
      </Box>
    );
  } else if (tab === "outbox") {
    const { data: notes } = await db.from("notifications").select("id, audience, recipient, channel, notification_type, subject, body_preview, body_html, delivery_status, provider, error_message, created_at").order("created_at", { ascending: false }).limit(100);
    body = (
      <Box title="Notification log (latest 100)">
        <p className="mb-3 text-xs text-muted-foreground">
          “Simulated” messages were recorded but not sent because no provider is configured. In demo mode their secure links are shown so the demo can be completed; real deliveries are always redacted.
        </p>
        <ul className="divide-y text-sm">
          {(notes ?? []).map((n) => (
            <li key={n.id} className="py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong>{n.notification_type.replace(/_/g, " ")}</strong> → {n.recipient} <span className="text-muted-foreground">({n.audience}, {n.channel})</span>
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <DeliveryBadge status={n.delivery_status} /> {formatDate(n.created_at)}
                </span>
              </div>
              {n.subject ? <p className="text-xs font-medium">{n.subject}</p> : null}
              {n.body_preview ? (
                <details>
                  <summary className="cursor-pointer text-xs text-[#0071e3]">Message</summary>
                  <pre className="mt-1 text-xs whitespace-pre-wrap">
                    {(n.body_preview as string).split(/(https?:\/\/\S+)/g).map((part: string, i: number) =>
                      /^https?:\/\//.test(part) ? (
                        <a key={i} href={part} className="text-[#0071e3] underline" target="_blank" rel="noreferrer">{part}</a>
                      ) : (
                        part
                      ),
                    )}
                  </pre>
                </details>
              ) : null}
              {n.body_html ? (
                <details>
                  <summary className="cursor-pointer text-xs text-[#0071e3]">Preview e-mail</summary>
                  <iframe title={n.subject ?? "E-mail preview"} srcDoc={n.body_html} sandbox="allow-popups allow-popups-to-escape-sandbox" className="mt-2 h-[760px] w-full max-w-[640px] rounded-xl border border-[#e1e5eb] bg-[#f7f9fc]" />
                </details>
              ) : null}
              {n.error_message ? <p className="text-xs text-destructive">{n.error_message}</p> : null}
            </li>
          ))}
        </ul>
      </Box>
    );
  } else if (tab === "audit") {
    const { data: logs } = await db.from("audit_logs").select("id, actor_label, action, entity_type, entity_id, details, created_at").order("created_at", { ascending: false }).limit(100);
    body = (
      <Box title="Audit log (latest 100)">
        <ul className="divide-y text-sm">
          {(logs ?? []).map((l) => (
            <li key={l.id} className="py-2">
              <p><strong>{l.action}</strong> on {l.entity_type} by {l.actor_label} · <span className="text-xs text-muted-foreground">{formatDate(l.created_at)}</span></p>
              <p className="truncate font-mono text-xs text-muted-foreground">{JSON.stringify(l.details)}</p>
            </li>
          ))}
        </ul>
      </Box>
    );
  }

  return (
    <>
      <PageHeader title="Settings" description="Buildings, assets, QR codes, teams, staff, escalation and configuration." />
      <nav aria-label="Admin sections" className="mb-6 flex w-fit max-w-full gap-1 overflow-x-auto border border-[#e1e5eb] bg-[#f1f3f6] p-1 text-[13px]">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/admin?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={`shrink-0 px-3.5 py-1.5 transition-colors ${tab === k ? "bg-[#0071e3] font-medium text-white shadow-[0_0_18px_-4px_rgba(0,113,197,0.9)]" : "text-muted-foreground hover:text-foreground"}`}>
            {label}
          </Link>
        ))}
      </nav>
      {body}
    </>
  );
}
