# Fiximperfect

AI-coordinated dormitory maintenance and asset intelligence. Students scan a QR code to report a problem. Specialist Claude agents and deterministic rules then classify it, catch safety emergencies, merge duplicates and route it to a team. Students confirm whether repairs actually worked, and management sees which equipment should be replaced, with the evidence behind each recommendation.

> All buildings, people, assets and costs in the demo dataset are **fictional** and flagged `is_demo`.

---

## 1. What is in the box

| Capability | Where |
|---|---|
| QR reporting (location resolved server-side, never from the browser) | `src/app/report/[qrSlug]`, `src/lib/assets/qr.ts` |
| Report intake orchestrator (two parallel agent rounds, validated outputs, graceful degradation) | `src/lib/workflows/report-intake.ts` |
| Agent 1: Vision & Classification | `src/lib/agents/vision-classifier.ts` |
| Agent 2: Safety Assessment + **deterministic safety rules** (AI can raise, never lower) | `src/lib/agents/safety-assessor.ts`, `src/lib/safety/rules.ts` |
| Agent 3: Duplicate detection (SQL candidate retrieval → Claude comparison → 85% / 65% threshold policy) | `src/lib/duplicate-detection/*`, `src/lib/agents/duplicate-detector.ts` |
| Concurrency-safe linking (advisory lock + retry in a Postgres function) | `attach_report_to_ticket()` in `supabase/migrations/…_workflow_functions.sql` |
| Agent 4: Triage & Routing (AI recommendation validated against the DB team directory) | `src/lib/agents/triage-router.ts`, `src/lib/routing/router.ts` |
| Emergency escalation (SMS + voice + email, ack links, timed backup escalation by cron) | `src/lib/workflows/emergency.ts`, `src/app/api/cron/escalations` |
| Student-verified resolution (per-reporter expiring tokens, negative → auto-reopen) | `src/lib/workflows/resolution.ts`, `submit_resolution_feedback()` |
| Asset intelligence (SQL figures; text built only from those figures; optional AI narrative) | `asset_intelligence()` SQL, `src/lib/assets/intelligence.ts` |
| Analytics (all SQL, RLS-scoped) | `analytics_overview()`, `analytics_breakdowns()` |
| Conversational management agent (Tool Runner + 4 read-only tools, no SQL tool) | `src/lib/agents/management-chat.ts` |
| Notifications (Resend, Twilio, clearly-labelled simulation) | `src/lib/notifications/*` |
| Caretaker dashboard, ticket detail, management dashboard, asset history, admin | `src/app/(staff)/*` |

### The report → ticket workflow

```
QR slug ──► resolveQr (DB) ──► save report + private photo
                                   │
          ┌────────────────────────┴───────────────────────┐
   Round 1│ Vision/Classification ║ Safety assessment       │  (parallel)
          └────────────────────────┬───────────────────────┘
                 deterministic safety rules  ──► max(rules, AI)
                                   │
          ┌────────────────────────┴───────────────────────┐
   Round 2│ SQL candidates → Duplicate agent ║ Triage agent │  (parallel)
          └────────────────────────┬───────────────────────┘
          threshold policy + routing validation (no invented teams)
                                   │
          attach_report_to_ticket()  (advisory lock; "retry" if a related
                                   │   ticket appeared concurrently)
          critical? ──► emergency workflow immediately (before anything else)
                                   │
          notifications (student confirmation, caretakers)
```

If any agent fails (no key, refusal, invalid output, timeout), the report is still saved and processed with rules and defaults, and the ticket goes to **Needs review** with the reason recorded. Every agent decision is stored on the report (`reports.ai_analysis`) and in `ai_runs`, and shown on the ticket page.

### AI integration details

* Official `@anthropic-ai/sdk`, model `claude-opus-5-5` by default (`ANTHROPIC_MODEL` overrides).
* Structured outputs via `client.beta.messages.parse` + `betaZodOutputFormat`. Every result is re-validated with a stricter Zod schema before it can affect the database. Categories, asset codes, ticket numbers and team names are checked against trusted lists.
* **Server-side refusal fallback** is enabled (`betas: ["server-side-fallback-2026-07-01"], fallbacks: "default"`). A refusal is handled as "AI unavailable", which triggers review instead of failing the report.
* Student text is wrapped in `<student_*>` tags. The system prompt says that content is untrusted data and instructions inside it must be ignored.
* `AI_MODE=mock` swaps each agent for a deterministic fixture with the *same output schema*. The rest of the workflow is unchanged and writes to the database. Mock results are labelled **"Mock AI fixture"** everywhere and are never shown as live AI.

---

## 2. Quick start

### Requirements
Node 20+ and a Supabase project (cloud, or local via `supabase start`).

```bash
npm install
cp .env.example .env.local        # fill in Supabase URL + keys (see §4)
npx supabase link --project-ref <ref>
npx supabase db push              # applies supabase/migrations/*
npm run demo:seed                 # fictional buildings, assets, staff, history
npm run dev                       # http://localhost:3000
```

Run `npm run demo:scenarios` to reset the demo data and run all four required scenarios through the real services. It prints a pass/fail summary.

### Local stack without Docker (what this repo was developed and tested on)

`supabase start` needs Docker images. If your network blocks them, `scripts/local-stack/up.sh` builds an equivalent stack from native binaries:

* Homebrew PostgreSQL 17 (`/tmp:5432`)
* PostgREST and Supabase Auth (GoTrue) binaries in `~/.local/fiximperfect-tools`
* `scripts/local-stack/gateway.ts`: serves `/rest/v1`, `/auth/v1` and a filesystem emulation of private-bucket `/storage/v1`

```bash
npm run stack:up        # or stack:reset to recreate the database
cat .local-stack/keys.env >> .env.local
```

This stack has no Supabase Realtime. Dashboards detect that and fall back to polling.

### Demo accounts (password `Demo-Fiximperfect-2026!`)

| Email | Role |
|---|---|
| caretaker@fiximperfect.example | Caretaker (Kossuth Dorm A + B) |
| caretaker.riverside@fiximperfect.example | Caretaker (Riverside Hall) |
| appliance.tech@fiximperfect.example | Maintenance staff (Appliance team) |
| plumber@fiximperfect.example | Maintenance staff (Plumbing) |
| manager@fiximperfect.example | Management (read-only) |
| admin@fiximperfect.example | Administrator |

---

## 3. Demo walkthrough (for the jury)

1. **Admin → Demo centre** has a button for each scenario. Every button calls the real workflow services.
2. **Duplicate detection:** open `/report/kossuth-b-floor2-washer03` on a phone and submit *"The washing machine door is broken."*, then *"Washer number 3 will not close."*, then *"The laundry machine door latch seems damaged."* with three different emails. Result: one ticket with three linked reports. The ticket page shows each agent's reasoning and confidence.
3. **Safety escalation:** at `/report/kossuth-b-floor1-corridor` submit *"There is water near an electrical socket."* The ticket becomes Critical and the dashboard shows a red emergency banner. SMS, voice and email alerts are recorded as *Simulated* unless Twilio/Resend are configured. Use **2b** to simulate a missed acknowledgement, which escalates to the secondary caretaker.
4. **Resolution verification:** as the caretaker, mark the Washer #3 ticket *Resolved*. Each reporter gets their own link (visible under **Admin → Notifications** when email is simulated). Answer "Yes, fixed" twice and "No, still broken" once. The ticket reopens, and the history and verified-resolution metrics update.
5. **Predictive maintenance:** **Management** shows Washer #1: four failures in 60 days, €420 repairs against €380 replacement, ratio **110.5%**, flagged for replacement review. Click through to see the tickets, expenses and calculation.

---

## 4. Environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Supabase client (Auth, Realtime). The anon key has **no table access** (RLS). |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only. Used after authorisation checks or token verification. |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Live Claude calls (`AI_MODE=live`). |
| `AI_MODE` | `live` or `mock`. |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Email delivery; otherwise simulated. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | Emergency SMS + voice; otherwise simulated. |
| `NEXT_PUBLIC_APP_URL` | Absolute links in messages. Must be `https://` for Twilio callbacks. |
| `NODE_USE_ENV_PROXY=1` | Set by `npm run dev` / `npm start`. Behind a corporate proxy, Node's `fetch` (Resend, Anthropic, Twilio) only uses `HTTPS_PROXY` when this is on. Harmless elsewhere. |
| `CRON_SECRET` | Bearer secret for `/api/cron/escalations`. |
| `DEMO_TOOLS_ENABLED` | `true` enables the demo centre and keeps links in *simulated* outbox previews. Set `false` in production. |

---

## 5. Security model

* **Students** need no account. They reach only their own report through random 256-bit tokens; only SHA-256 hashes are stored. Feedback and acknowledgement tokens work the same way and expire. GET pages never change state: answering requires a POST, so link scanners can't answer on a student's behalf.
* **RLS** on every table. Caretakers see only buildings in `profiles.building_access`. Management and administrators read everything. Management cannot modify tickets. Maintenance staff can modify only tickets assigned to them or their team. Workflow RPCs are `EXECUTE`-revoked from `anon`/`authenticated`.
* **Photos** go to a private bucket under random paths. Real type is checked by magic bytes, with a 5 MB limit. Staff view them through 5-minute signed URLs behind an RLS check.
* **Rate limiting** is Postgres-backed (works across serverless instances) on reporting, history links, feedback, acknowledgement and chat.
* **Money** uses `numeric(12,2)`. `total_cost` is a generated column, so client totals are impossible. Currencies are never combined.
* Audit trail: `ticket_events` records every change and `audit_logs` records staff/admin actions.
* Notification status records only what the provider confirmed: `simulated`, `queued`/`sent` (accepted), `delivered` (provider callback), or `failed`.
* Public emergency services are **never** contacted. Escalation notifies authorised university personnel only.

---

## 6. Tests

```bash
npm test                   # unit (48): safety rules, thresholds, routing, money, tokens, images, permissions, recommendation text
npm run test:integration   # 23 against the real database: QR, uploads, RLS, concurrency, escalation, feedback, analytics, reset
npm run build && npm start # then:
npm run test:e2e           # 8 HTTP end-to-end tests against the running server
```

Integration and e2e tests run in mock AI mode with simulated providers. They re-seed the demo data, so don't point them at production.

---

## 7. Deploying to Vercel

1. Push the repo and import it in Vercel.
2. Set the environment variables from §4 (`AI_MODE=live` with an Anthropic key for the real agents; `DEMO_TOOLS_ENABLED=false` for a non-demo deployment).
3. `npx supabase db push` against the production project, then `npm run demo:seed` if you want the demo dataset.
4. `vercel.json` schedules `/api/cron/escalations` **every minute**. Vercel sends `Authorization: Bearer $CRON_SECRET`. Per-minute schedules need a Vercel Pro plan; on Hobby, call the endpoint from Supabase `pg_cron` + `pg_net` or any external scheduler instead.
5. For Twilio delivery receipts and press-1 acknowledgement, `NEXT_PUBLIC_APP_URL` must be the public `https://` URL.

---

## 8. Known limitations / not yet verified

* **Live Claude mode is implemented but was not exercised in development** because no API key was available. Everything verified so far ran in mock mode. Run one report with `AI_MODE=live` before the demo.
* Resend and Twilio integrations are implemented but were only tested in simulated mode (no credentials).
* Supabase Realtime subscriptions could not be tested locally (no Realtime in the Docker-free stack). The polling fallback was used.
* Browser-level UI tests were not automated (Playwright could not be installed through the proxy). The e2e suite works at the HTTP level, and pages were checked with headless-browser screenshots (`scripts/screenshot.mjs`).
* Twilio voice calls and SMS bodies are English only.
