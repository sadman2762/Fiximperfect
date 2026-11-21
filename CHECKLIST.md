# Development checklist

Status as of 2026-11-21. ✅ = implemented **and** verified by automated tests or a run; 🟡 = implemented but not verified end-to-end; ⬜ = not done.

## Phase 1 — Foundation
- ✅ Next.js 15 App Router, strict TypeScript, Tailwind 4, shadcn/ui (Base UI)
- ✅ Supabase migrations (6 files): schema, workflow RPCs, analytics, RLS/storage/realtime, student tokens, demo reset
- ✅ Staff auth (Supabase Auth, cookie sessions, middleware refresh), role-based pages/APIs
- ✅ `.env.example`, server-only env validation

## Phase 2 — QR & reporting
- ✅ Buildings/locations/assets, asset & location QR slugs, server-side resolution
- ✅ QR SVG/PNG generation, printable label sheet
- ✅ Mobile reporting form, photo upload (magic-byte validation, 5 MB, private bucket, signed URLs)
- ✅ Hashed tracking tokens, tracking page, emailed history link

## Phase 3 — AI
- 🟡 Live Claude agents (vision/classification, safety, duplicates, triage, asset narrative, management chat): built and typechecked, **not run** (no API key)
- ✅ Zod-validated outputs, trusted-list post-validation, refusal/failure degradation to review
- ✅ Mock fixtures with identical schemas, labelled everywhere

## Phase 4 — Tickets
- ✅ Report/ticket separation, concurrency-safe linking (tested with 4 parallel submissions)
- ✅ Review band (65–84%) → needs review, merge / keep separate
- ✅ Status state machine (TS + SQL), assignment, priority with reason, notes, costs, audit events

## Phase 5 — Emergency
- ✅ Deterministic rules + AI max(), critical bypass, alerts to escalation chain
- ✅ Ack via link / dashboard; timed escalation via cron endpoint; exhaustion → management
- 🟡 Twilio SMS/voice + status/gather webhooks (simulated only)

## Phase 6 — Verified resolution
- ✅ Per-reporter expiring feedback tokens, no duplicate requests, negative → reopen, all-positive → verified, metrics

## Phase 7 — Asset intelligence
- ✅ Registry, costs (generated totals), 30/60/90-day failures, repeat failures, ratio, configurable rules, evidence page

## Phase 8 — Dashboards
- ✅ Caretaker dashboard, ticket list (search/sort/filter/paginate), ticket detail with AI reasoning
- ✅ Management dashboard (KPIs, charts, building comparison, asset review, chat)
- ✅ Admin (buildings, locations, assets, QR, teams, categories, routing overrides, staff/roles, contacts, settings, notification log, audit log, demo centre)
- 🟡 Realtime refresh (polling fallback verified; Realtime itself untested locally)

## Phase 9 — Notifications
- ✅ Student/caretaker/team/management notifications recorded with truthful delivery status
- 🟡 Resend delivery (simulated only)

## Phase 10 — Quality
- ✅ `tsc`, ESLint, `next build` clean
- ✅ 48 unit + 23 integration + 8 HTTP e2e tests passing
- ✅ `npm run demo:scenarios` passes all four scenarios
- ⬜ Browser-automation tests (Playwright unavailable through proxy)
- ⬜ Actual Vercel deployment (instructions in README)

