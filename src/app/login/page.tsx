import type { Metadata } from "next";
import { env } from "@/lib/env";
import { LoginForm } from "@/components/staff/login-form";

export const metadata: Metadata = { title: "Staff sign-in" };
export const dynamic = "force-dynamic";

export default function LoginPage() {
  // Demo credentials are only shown when demo tools are enabled.
  return <LoginForm showDemo={env().DEMO_TOOLS_ENABLED === "true"} />;
}

