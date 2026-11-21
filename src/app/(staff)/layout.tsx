import { FlaskConical } from "lucide-react";
import { requireStaffPage } from "@/lib/auth/session";
import { providerStatus } from "@/lib/env";
import { StaffNav } from "@/components/shared/staff-nav";

export const dynamic = "force-dynamic";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaffPage();
  const providers = providerStatus();
  const demo = providers.ai !== "live" || providers.email !== "live" || providers.sms !== "live";
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <StaffNav staff={{ full_name: staff.full_name, role: staff.role }} />
      <div className="min-w-0 flex-1">
        <main className="mx-auto max-w-[1200px] px-5 pt-8 pb-16 md:px-10 md:pt-12">
          {demo ? (
            <div className="mb-6 flex justify-end">
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-xs text-[#6e6e73] surface"
                title="Simulated messages are recorded but never sent. Mock AI decisions are labelled wherever they appear."
              >
                <FlaskConical className="size-3.5 text-[#c93400]" aria-hidden />
                Demo mode · AI {providers.ai === "live" ? "live" : providers.ai === "mock" ? "mock fixtures" : "missing key"} · email {providers.email} · SMS & voice {providers.sms}
              </span>
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
