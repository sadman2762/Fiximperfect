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

/** White sidebar (desktop) / white top bar (mobile) with green active-state indicators. */
export function StaffNav({ staff }: { staff: { full_name: string; role: StaffRole } }) {
  const path = usePathname();
  const items = NAV.filter((n) => n.roles.includes(staff.role));
  return (
    <aside className="chrome sticky top-0 z-30 border-b border-[#dde2e5] md:h-dvh md:w-64 md:shrink-0 md:border-r md:border-b-0">
      <div className="flex h-full flex-col">
        <Link href="/dashboard" className="flex items-center gap-2.5 px-5 pt-4 pb-3 md:pt-7 md:pb-7">
          <AppMark className="size-8" />
          <Wordmark className="text-[18px]" />
        </Link>
        <p className="hidden px-6 pb-2 text-[11px] font-semibold tracking-[0.08em] text-[#5f7183] uppercase md:block">Workspace</p>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
          {items.map(({ href, label, Icon }) => {
            const active = path === href || path.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] transition-colors",
                  active
                    ? "bg-[#e6f4f0] font-semibold text-[#00866a] after:absolute after:inset-x-3 after:bottom-0 after:h-[3px] after:rounded-full after:bg-[#00866a] md:after:inset-x-auto md:after:inset-y-2 md:after:left-0 md:after:h-auto md:after:w-[3px]"
                    : "text-[#3b4d5e] hover:bg-[#f5f7f8] hover:text-[#183247]",
                )}
              >
                <Icon className="size-[18px]" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto hidden p-3 md:block">
          <div className="flex items-center gap-3 rounded-xl border border-[#dde2e5] bg-[#f5f7f8] px-3 py-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#00866a] text-[12px] font-semibold text-white">{initials(staff.full_name)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-[#183247]">{staff.full_name.replace(/\s*\(.*?\)/, "")}</p>
              <p className="text-xs text-[#5f7183]">{ROLE_LABEL[staff.role]}</p>
            </div>
            <form action="/api/auth/logout" method="post">
              <button className="grid size-8 place-items-center rounded-lg text-[#5f7183] hover:bg-white hover:text-[#183247]" aria-label="Sign out" title="Sign out">
                <LogOut className="size-4" aria-hidden />
              </button>
            </form>
          </div>
        </div>
      </div>
    </aside>
  );
}
