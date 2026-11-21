import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ quiet: true });
// Tests always use deterministic mock AI fixtures and simulated providers.
process.env.AI_MODE = "mock";
delete process.env.RESEND_API_KEY;
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.ANTHROPIC_API_KEY;
process.env.DEMO_TOOLS_ENABLED = "true";
