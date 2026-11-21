import Link from "next/link";
import type { Metadata } from "next";
import { requireStaffPage } from "@/lib/auth/session";
import { sessionClient } from "@/lib/supabase/server";
import { filterOptions, listTickets, TicketFilterSchema, type TicketFilters } from "@/lib/tickets/queries";
import { PageHeader, NativeSelect } from "@/components/shared/ui-bits";
import { TicketTable } from "@/components/tickets/ticket-table";
import { LiveRefresh } from "@/components/dashboard/live-refresh";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { PRIORITIES, TICKET_STATUSES } from "@/types/domain";
import { STATUS_LABELS } from "@/lib/tickets/state-machine";

export const metadata: Metadata = { title: "Tickets" };

export default async function TicketsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireStaffPage();
  const raw = await searchParams;
  const f = TicketFilterSchema.parse(raw);
  const db = await sessionClient();
  const [list, opts] = await Promise.all([listTickets(db, f), filterOptions(db)]);
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));

  const href = (patch: Partial<TicketFilters>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...f, ...patch })) if (v !== undefined && v !== "") p.set(k, String(v));
    return `/tickets?${p.toString()}`;
  };

  return (
    <>
      <LiveRefresh />
      <PageHeader title="Maintenance tickets" description={`${list.total} ticket${list.total === 1 ? "" : "s"} match the current filters.`} />
      <form className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7" role="search">
        <Input name="q" placeholder="Search tickets…" defaultValue={f.q} className="col-span-2 md:col-span-4 lg:col-span-2" aria-label="Search" />
        <NativeSelect name="status" defaultValue={f.status ?? "active"} aria-label="Status">
          <option value="active">All active</option>
          <option value="all">All statuses</option>
          {TICKET_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="priority" defaultValue={f.priority ?? ""} aria-label="Priority">
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p[0].toUpperCase() + p.slice(1)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="category" defaultValue={f.category ?? ""} aria-label="Category">
          <option value="">Any category</option>
          {opts.categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </NativeSelect>
        <NativeSelect name="building" defaultValue={f.building ?? ""} aria-label="Building">
          <option value="">Any building</option>
          {opts.buildings.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="team" defaultValue={f.team ?? ""} aria-label="Team">
          <option value="">Any team</option>
          {opts.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.team_name}
            </option>
          ))}
        </NativeSelect>
        <div className="col-span-2 flex gap-2 md:col-span-4 lg:col-span-7">
          <Button type="submit">Apply filters</Button>
          <Link href="/tickets" className={buttonVariants({ variant: "ghost" })}>
            Reset
          </Link>
        </div>
      </form>
      <TicketTable
        rows={list.rows}
        sort={f.sort ?? "created_at"}
        dir={f.dir ?? "desc"}
        sortHref={(k) => href({ sort: k, dir: f.sort === k && f.dir !== "asc" ? "asc" : "desc", page: 1 })}
      />
      <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Page {list.page} of {pages}
        </span>
        <div className="flex gap-2">
          {list.page > 1 ? (
            <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={href({ page: list.page - 1 })}>
              Previous
            </Link>
          ) : null}
          {list.page < pages ? (
            <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={href({ page: list.page + 1 })}>
              Next
            </Link>
          ) : null}
        </div>
      </nav>
    </>
  );
}
