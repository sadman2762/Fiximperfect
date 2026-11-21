"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Boxes, LayoutGrid, LogOut, Settings2, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppMark } from "@/components/shared/app-mark";
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

export function StaffNav({ staff }: { staff: { full_name: string; role: StaffRole } }) {
  const path = usePathname();
  const items = NAV.filter((n) => n.roles.includes(staff.role));
  return (
    <aside className="glass sticky top-0 z-30 border-b border-black/[0.06] md:h-dvh md:w-64 md:shrink-0 md:border-r md:border-b-0">
      <div className="flex h-full flex-col">
        <Link href="/dashboard" className="flex items-center gap-2.5 px-5 pt-4 pb-3 md:pt-7 md:pb-6">
          <AppMark className="size-8" />
          <span className="text-[17px] font-semibold tracking-tight">Fiximperfect</span>
        </Link>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
          {items.map(({ href, label, Icon }) => {
            const active = path === href || path.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-[14px] transition-colors",
                  active ? "bg-black/[0.06] font-semibold text-foreground" : "text-[#424245] hover:bg-black/[0.035]",
                )}
              >
                <Icon className={cn("size-[18px]", active ? "text-primary" : "text-[#86868b]")} strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto hidden p-3 md:block">
          <div className="flex items-center gap-3 rounded-2xl px-2 py-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#c7c7cc] to-[#8e8e93] text-[13px] font-semibold text-white">
              {initials(staff.full_name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold">{staff.full_name.replace(/\s*\(.*?\)/, "")}</p>
              <p className="text-xs text-muted-foreground">{ROLE_LABEL[staff.role]}</p>
            </div>
            <form action="/api/auth/logout" method="post">
              <button className="grid size-8 place-items-center rounded-full text-[#86868b] hover:bg-black/5 hover:text-foreground" aria-label="Sign out" title="Sign out">
                <LogOut className="size-4" aria-hidden />
              </button>
            </form>
          </div>
        </div>
      </div>
    </aside>
  );
}
