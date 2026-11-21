"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Boxes, LayoutGrid, LogOut, Settings2, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppMark, Wordmark } from "@/components/shared/app-mark";
import type { StaffRole } from "@/types/domain";

const NAV: { href: string; label: string; Icon: typeof Ticket; roles: StaffRole[] }[] = [
  { href: "/dashboard", label: "Overview", Icon: LayoutGrid, roles: ["caretaker", "maintenance_staff", "administrator", "management"] },
  { href: "/tickets", label: "Tickets", Icon: Ticket, roles: ["caretaker", "maintenance_staff", "administrator", "management"] },
  { href: "/assets", label: "Assets", Icon: Boxes, roles: ["caretaker", "administrator", "management"] },
  { href: "/analytics", label: "Insights", Icon: BarChart3, roles: ["management", "administrator", "caretaker"] },
  { href: "/admin", label: "Settings", Icon: Settings2, roles: ["administrator"] },
];

const ROLE_LABEL: Record<StaffRole, string> = {
  caretaker: "Caretaker",
  maintenance_staff: "Maintenance",
  administrator: "Administrator",
  management: "Management",
};

function initials(name: string) {
  return name
    .replace(/\(.*?\)/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

/** Navy sidebar (desktop) / navy top bar (mobile). */
export function StaffNav({ staff }: { staff: { full_name: string; role: StaffRole } }) {
  const path = usePathname();
  const items = NAV.filter((n) => n.roles.includes(staff.role));
  return (
    <aside className="navy sticky top-0 z-30 md:h-dvh md:w-64 md:shrink-0">
      <div className="flex h-full flex-col">
        <Link href="/dashboard" className="flex items-center gap-2.5 px-5 pt-4 pb-3 md:pt-7 md:pb-7">
          <AppMark className="size-8 ring-white/20" />
          <Wordmark onDark className="text-[18px]" />
        </Link>
        <p className="hidden px-6 pb-2 text-[11px] font-semibold tracking-[0.08em] text-white/40 uppercase md:block">Workspace</p>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
          {items.map(({ href, label, Icon }) => {
            const active = path === href || path.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] transition-colors",
                  active ? "bg-[#0071e3] font-medium text-white shadow-[0_6px_16px_-8px_rgba(0,113,227,0.9)]" : "text-white/70 hover:bg-white/[0.07] hover:text-white",
                )}
              >
                <Icon className="size-[18px]" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto hidden p-3 md:block">
          <div className="flex items-center gap-3 rounded-2xl bg-white/[0.06] px-3 py-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#e8f2ff] text-[12px] font-semibold text-[#0b1f3a]">{initials(staff.full_name)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-white">{staff.full_name.replace(/\s*\(.*?\)/, "")}</p>
              <p className="text-xs text-white/55">{ROLE_LABEL[staff.role]}</p>
            </div>
            <form action="/api/auth/logout" method="post">
              <button className="grid size-8 place-items-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white" aria-label="Sign out" title="Sign out">
                <LogOut className="size-4" aria-hidden />
              </button>
            </form>
          </div>
        </div>
      </div>
    </aside>
  );
}
