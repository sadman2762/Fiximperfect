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
    <section className="rounded-[22px] bg-card p-5 surface">
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
    db.from("locations").select("id, building_id, floor, area_name, qr_slug, location_type").order("floor"),
    db.from("maintenance_teams").select("id, team_name, description, responsible_categories, is_manual_review_queue").order("team_name"),
    db.from("categories").select("id, name, description, default_team_id, default_priority").order("name"),
  ]);
  const bOpts = (buildings ?? []).map((b) => ({ value: b.id, label: b.name }));
  const lOpts = (locations ?? []).map((l) => ({ value: l.id, label: `${(buildings ?? []).find((b) => b.id === l.building_id)?.code} · F${l.floor} ${l.area_name}` }));
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
            Student QR pages: <Link className="text-primary underline" href="/report/kossuth-b-floor2-washer03">Washer #3</Link> ·{" "}
            <Link className="text-primary underline" href="/report/kossuth-b-floor1-corridor">Kossuth B corridor</Link> ·{" "}
            <Link className="text-primary underline" href="/report/kossuth-b-floor2-kitchen">Kossuth B kitchen</Link>
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
      { name: "area_name", label: "Area name", type: "text", required: true },
      { name: "qr_slug", label: "QR slug", type: "text", required: true, placeholder: "kossuth-b-floor2-kitchen" },
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
        {(buildings ?? []).map((b) => (
          <Box key={b.id} title={`${b.name} (${b.code})${b.is_demo ? " · demo" : ""}`}>
            <ul className="divide-y text-sm">
              {(locations ?? []).filter((l) => l.building_id === b.id).map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    Floor {l.floor} · {l.area_name} <span className="font-mono text-xs text-muted-foreground">/{l.qr_slug}</span>
                  </span>
                  <DeleteButton endpoint="/api/admin/locations" id={l.id} />
                </li>
              ))}
            </ul>
          </Box>
        ))}
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
      { name: "qr_slug", label: "QR slug", type: "text" },
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
                    <Link href={`/assets/${a.id}`} className="font-medium text-primary hover:underline">{a.asset_name}</Link>{" "}
                    <span className="font-mono text-xs text-muted-foreground">{a.asset_code}</span> · {a.category} · replacement {a.replacement_cost ?? "—"} {a.currency} · {a.operational_status}
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
    const { data: assets } = await db.from("assets").select("id, asset_name, asset_code, qr_slug, building_id").not("qr_slug", "is", null).order("asset_code");
    const items = [
      ...(locations ?? []).map((l) => ({ slug: l.qr_slug, title: l.area_name, sub: `${(buildings ?? []).find((b) => b.id === l.building_id)?.name} · floor ${l.floor}`, kind: "Location" })),
      ...(assets ?? []).map((a) => ({ slug: a.qr_slug as string, title: a.asset_name, sub: `${a.asset_code} · ${(buildings ?? []).find((b) => b.id === a.building_id)?.name}`, kind: "Asset" })),
    ];
    const svgs = await Promise.all(items.map((i) => QRCode.toString(appUrl(`/report/${i.slug}`), { type: "svg", margin: 1 })));
    body = (
      <Box title="QR labels">
        <p className="mb-3 text-xs text-muted-foreground">
          Each code encodes only the public report URL with a stable slug; location data is resolved on the server.{" "}
          <Link href="/admin/qr-labels" className="text-primary underline">Open printable label sheet</Link>
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((i, idx) => (
            <div key={i.slug} className="rounded-lg border p-2 text-center">
              <div className="mx-auto w-28" dangerouslySetInnerHTML={{ __html: svgs[idx] }} />
              <p className="mt-1 text-xs font-medium">{i.title}</p>
              <p className="text-[11px] text-muted-foreground">{i.kind} · {i.sub}</p>
              <div className="mt-1 flex justify-center gap-2 text-[11px]">
                <a className="text-primary underline" href={`/api/qr/${i.slug}?format=png`}>PNG</a>
                <a className="text-primary underline" href={`/api/qr/${i.slug}`} target="_blank" rel="noreferrer">SVG</a>
                <Link className="text-primary underline" href={`/report/${i.slug}`}>Open</Link>
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
                  <summary className="cursor-pointer text-xs text-primary">Message</summary>
                  <pre className="mt-1 text-xs whitespace-pre-wrap">
                    {(n.body_preview as string).split(/(https?:\/\/\S+)/g).map((part: string, i: number) =>
                      /^https?:\/\//.test(part) ? (
                        <a key={i} href={part} className="text-primary underline" target="_blank" rel="noreferrer">{part}</a>
                      ) : (
                        part
                      ),
                    )}
                  </pre>
                </details>
              ) : null}
              {n.body_html ? (
                <details>
                  <summary className="cursor-pointer text-xs text-primary">Preview e-mail</summary>
                  <iframe title={n.subject ?? "E-mail preview"} srcDoc={n.body_html} sandbox="allow-popups allow-popups-to-escape-sandbox" className="mt-2 h-[760px] w-full max-w-[640px] rounded-xl border border-black/[0.06] bg-[#f5f5f7]" />
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
      <nav aria-label="Admin sections" className="mb-6 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-black/[0.05] p-1 text-[13px]">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/admin?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={`shrink-0 rounded-full px-3.5 py-1.5 transition-colors ${tab === k ? "bg-white font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {label}
          </Link>
        ))}
      </nav>
      {body}
    </>
  );
}
