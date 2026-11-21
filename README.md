# Fiximperfect

AI-coordinated dormitory maintenance. Students scan the QR code of a room and describe a problem. AI agents and deterministic safety rules classify the report, detect emergencies, merge duplicates and route the ticket to the right team. Students then confirm whether the repair worked.

All demo data (buildings, people, equipment, costs) is fictional.

## Requirements

- Node.js 20 or newer
- Docker (Docker Desktop or similar), used by the Supabase CLI to run the database locally
- macOS or Linux. On Windows, use WSL.

## Run locally

```bash
git clone https://github.com/sadman2762/Fiximperfect.git
cd Fiximperfect
npm install

# 1. Start Supabase locally (Postgres, Auth, Storage). Migrations are applied automatically.
npx supabase start

# 2. Create the environment file
cp .env.example .env.local
npx supabase status -o env
```

Copy these values from the `supabase status` output into `.env.local`:

| `.env.local` | from `supabase status` |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `API_URL` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `ANON_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` | `SERVICE_ROLE_KEY` |

```bash
# 3. Load the demo data and start the app
npm run demo:seed
npm run dev
```

Open http://localhost:3000.

With the default `.env.example`, AI runs as clearly labelled mock fixtures (`AI_MODE=mock`), and email and SMS are simulated. Nothing else is needed.

To reset the demo data at any time, run `npm run demo:reset`.

## Try it

**As a student** (no account needed), open one of these room QR pages and submit a report:

- http://localhost:3000/report/kossuth-b-floor2-laundry (Laundry Room)
- http://localhost:3000/report/kossuth-b-room-204 (Room 204)
- http://localhost:3000/report/kossuth-b-floor1-corridor (Corridor)

There is also an emergency report page at http://localhost:3000/emergency.

**As staff**, sign in at http://localhost:3000/login. The password for every account is `Demo-Fiximperfect-2026!`.

| Email | Role |
|---|---|
| caretaker@fiximperfect.example | Caretaker |
| appliance.tech@fiximperfect.example | Maintenance staff |
| manager@fiximperfect.example | Management |
| admin@fiximperfect.example | Administrator |

**Settings → Demo centre** (administrator) runs the built-in scenarios: duplicate detection, safety escalation, resolution verification and predictive maintenance. **Settings → QR codes** shows the printable QR code of every room.

## Optional: live services

Add these to `.env.local` to use real providers instead of mocks and simulation, then restart `npm run dev`.

| Variable | Enables |
|---|---|
| `AI_MODE=live`, `ANTHROPIC_API_KEY` | Real Claude agents (model `claude-opus-5-5` by default; override with `ANTHROPIC_MODEL`) |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Real e-mail |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | Emergency SMS and voice calls |

## Tests

```bash
npm run typecheck
npm run lint
npm test                    # unit tests
npm run test:integration    # needs the local Supabase from step 1
npm run build && npm start  # then, in a second terminal:
npm run test:e2e
```

Integration and end-to-end tests re-seed the demo data.

## Stop

```bash
# stop the app with Ctrl+C, then:
npx supabase stop
```

## Tech stack

Next.js (App Router), TypeScript, Tailwind CSS, Supabase (Postgres, Auth, Storage, Realtime), Anthropic SDK, Zod, Recharts, Resend, Twilio.

