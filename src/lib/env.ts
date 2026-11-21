import "server-only";
import { z } from "zod";

/**
 * Server-side configuration. Secrets are only ever read here (never via
 * NEXT_PUBLIC_*), and this module cannot be imported into client components.
 */
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional(),
  AI_MODE: z.enum(["live", "mock"]).default("mock"),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  CRON_SECRET: z.string().optional(),
  DEMO_TOOLS_ENABLED: z.enum(["true", "false"]).default("true"),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse({
    ...process.env,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || undefined,
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || undefined,
    RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL || undefined,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || undefined,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || undefined,
    TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER || undefined,
    CRON_SECRET: process.env.CRON_SECRET || undefined,
    AI_MODE: process.env.AI_MODE || undefined,
    DEMO_TOOLS_ENABLED: process.env.DEMO_TOOLS_ENABLED || undefined,
  });
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid server configuration (${fields}). See .env.example.`);
  }
  cached = parsed.data;
  return cached;
}

export const DEFAULT_MODEL = "claude-opus-5-5";

export function aiConfig() {
  const e = env();
  return {
    mode: e.AI_MODE,
    model: e.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
    hasKey: Boolean(e.ANTHROPIC_API_KEY),
  };
}

export function providerStatus() {
  const e = env();
  return {
    ai: e.AI_MODE === "live" ? (e.ANTHROPIC_API_KEY ? "live" : "misconfigured") : "mock",
    email: e.RESEND_API_KEY && e.RESEND_FROM_EMAIL ? "live" : "simulated",
    sms: e.TWILIO_ACCOUNT_SID && e.TWILIO_AUTH_TOKEN && e.TWILIO_PHONE_NUMBER ? "live" : "simulated",
  } as const;
}

export function appUrl(path = "") {
  return `${env().NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}${path}`;
}

/** Test hook: reset cached env between test cases. */
export function __resetEnvCache() {
  cached = null;
}
