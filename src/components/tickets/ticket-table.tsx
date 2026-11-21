import Link from "next/link";
import { ChevronDown, ChevronUp, Users } from "lucide-react";
import { PriorityBadge, SafetyBadge, StatusBadge } from "@/components/shared/badges";
import { EmptyState, formatDate } from "@/components/shared/ui-bits";
import type { TicketListRow } from "@/lib/tickets/queries";
import { placeName } from "@/lib/locations/label";

type SortKey = "ticket_number" | "priority" | "status" | "created_at";

export function TicketTable({
  rows,
  sortHref,
  sort,
  dir,
}: {
  rows: TicketListRow[];
  sortHref?: (key: SortKey) => string;
  sort?: string;
  dir?: string;
}) {
  if (!rows.length) return <EmptyState title="No tickets match">Try changing the filters.</EmptyState>;
  const Th = ({ k, children, className }: { k?: SortKey; children: React.ReactNode; className?: string }) => (
    <th scope="col" className={`px-4 py-3 text-left text-[12px] font-medium text-muted-foreground ${className ?? ""}`} aria-sort={k && sort === k ? (dir === "asc" ? "ascending" : "descending") : undefined}>
      {k && sortHref ? (
        <Link href={sortHref(k)} className="inline-flex items-center gap-0.5 hover:text-foreground">
          {children}
          {sort === k ? dir === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" /> : null}
        </Link>
      ) : (
        children
      )}
    </th>
  );
  return (
    <div className="overflow-x-auto rounded-xl bg-card surface">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="border-b border-[#dde2e5]">
          <tr>
            <Th k="ticket_number">Issue</Th>
            <Th>Asset</Th>
            <Th>Category</Th>
            <Th k="priority">Priority</Th>
            <Th className="text-right">Reports</Th>
            <Th>Team</Th>
            <Th k="status">Status</Th>
            <Th k="created_at">Created</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className={`border-b last:border-0 hover:bg-[#f8fafa] ${t.safety_level === "critical" && t.escalation_status !== "acknowledged" && !["resolved", "closed"].includes(t.status) ? "bg-[#fef2f2]" : ""}`}>
              <td className="max-w-[380px] px-4 py-3.5">
                <Link href={`/tickets/${t.id}`} className="group block">
                  <span className="font-mono text-[11px] text-muted-foreground">{t.ticket_number}</span>
                  <span className="block text-[14px] leading-snug font-medium group-hover:text-[#006b55]">{t.title}</span>
                  <span className="mt-0.5 block text-[12px] text-muted-foreground">
                    {t.buildings.name} · Floor {t.locations.floor} · {placeName(t.locations)}
                  </span>
                </Link>
                {t.safety_level !== "none" ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <SafetyBadge level={t.safety_level} />
                  </div>
                ) : null}
              </td>
              <td className="px-4 py-3.5 text-[13px]">{t.assets ? `${t.assets.asset_name}` : <span className="text-muted-foreground">—</span>}</td>
              <td className="px-4 py-3.5 text-[13px]">{t.category}</td>
              <td className="px-4 py-3.5">
                <PriorityBadge priority={t.priority} />
              </td>
              <td className="px-4 py-3.5 text-right tabular-nums">
                <span className="inline-flex items-center gap-1">
                  <Users className="size-3.5 text-muted-foreground" aria-hidden />
                  {t.reports[0]?.count ?? 0}
                </span>
              </td>
              <td className="max-w-[160px] px-4 py-3.5 text-[13px]">{t.maintenance_teams?.team_name ?? <span className="text-muted-foreground">Unassigned</span>}</td>
              <td className="px-4 py-3.5">
                <StatusBadge status={t.status} />
              </td>
              <td className="px-4 py-3.5 text-xs whitespace-nowrap text-muted-foreground">{formatDate(t.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
