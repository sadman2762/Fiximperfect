/**
 * Server start-up hook. Behind a corporate proxy (HTTPS_PROXY set), route the
 * server's outbound fetch/HTTP traffic (Resend, Anthropic, Twilio) through it.
 * No effect when no proxy is configured (e.g. on Vercel).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}

