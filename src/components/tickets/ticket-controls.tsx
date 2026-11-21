"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/shared/ui-bits";
import { STATUS_LABELS, TRANSITIONS, COORDINATOR_ONLY } from "@/lib/tickets/state-machine";
import { PRIORITIES, type Priority, type TicketStatus } from "@/types/domain";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.issues?.[0]?.message ?? json.error ?? "Request failed");
  return json;
}

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
      router.refresh();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
      return false;
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}

export function StatusControls({ ticketId, status, coordinator, verified }: { ticketId: string; status: TicketStatus; coordinator: boolean; verified: boolean }) {
  const { busy, run } = useAction();
  const [note, setNote] = useState("");
  const options = TRANSITIONS[status].filter((s) => coordinator || !COORDINATOR_ONLY.includes(s));
  return (
    <div className="space-y-2">
      <Textarea rows={2} placeholder="Note for the history (optional; required when closing an unverified fix)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Status note" />
      <div className="flex flex-wrap gap-2">
        {options.map((s) => (
          <Button
            key={s}
            size="sm"
            className={s === "resolved" ? "w-full" : undefined}
            variant={s === "resolved" ? "default" : "outline"}
            disabled={busy !== null}
            onClick={async () => {
              if (await run(s, () => post(`/api/tickets/${ticketId}/status`, { status: s, note: note || null, expectedStatus: status }), `Status changed to ${STATUS_LABELS[s]}`)) setNote("");
            }}
          >
            {busy === s ? "…" : s === "resolved" ? "Mark resolved & ask reporters" : `→ ${STATUS_LABELS[s]}`}
          </Button>
        ))}
      </div>
      {status === "resolved" && !verified ? <p className="text-xs text-muted-foreground">Waiting for every reporting student to confirm the fix.</p> : null}
    </div>
  );
}

export function AssignmentControls({
  ticketId,
  teams,
  people,
  teamId,
  assigneeId,
}: {
  ticketId: string;
  teams: { id: string; team_name: string }[];
  people: { id: string; full_name: string }[];
  teamId: string | null;
  assigneeId: string | null;
}) {
  const { busy, run } = useAction();
  const [team, setTeam] = useState(teamId ?? "");
  const [person, setPerson] = useState(assigneeId ?? "");
  return (
    <div className="grid gap-3">
      <div className="space-y-1">
        <Label htmlFor="team">Team</Label>
        <NativeSelect id="team" value={team} onChange={(e) => setTeam(e.target.value)}>
          <option value="">Unassigned</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.team_name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <Label htmlFor="person">Person</Label>
        <NativeSelect id="person" value={person} onChange={(e) => setPerson(e.target.value)}>
          <option value="">Nobody specific</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Button
        className="w-full"
        disabled={busy !== null || (team === (teamId ?? "") && person === (assigneeId ?? ""))}
        onClick={() => run("assign", () => post(`/api/tickets/${ticketId}/assign`, { teamId: team || null, assigneeId: person || null }), "Assignment saved")}
      >
        Save
      </Button>
    </div>
  );
}

export function PriorityControls({ ticketId, priority, critical }: { ticketId: string; priority: Priority; critical: boolean }) {
  const { busy, run } = useAction();
  const [p, setP] = useState<Priority>(priority);
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-2">
      <div className="grid gap-2">
        <NativeSelect value={p} onChange={(e) => setP(e.target.value as Priority)} aria-label="Priority">
          {PRIORITIES.map((x) => (
            <option key={x} value={x}>
              {x[0].toUpperCase() + x.slice(1)}
            </option>
          ))}
        </NativeSelect>
        <Input placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason for priority change" />
        <Button className="w-full" disabled={busy !== null || p === priority || reason.trim().length < 3} onClick={() => run("prio", () => post(`/api/tickets/${ticketId}/priority`, { priority: p, reason }), "Priority updated")}>
          Update
        </Button>
      </div>
      {critical && p !== "critical" ? <p className="text-xs text-[#b42323]">This is a critical safety ticket. Lowering the priority is recorded as a safety override.</p> : null}
    </div>
  );
}

export function NoteForm({ ticketId }: { ticketId: string }) {
  const { busy, run } = useAction();
  const [note, setNote] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run("note", () => post(`/api/tickets/${ticketId}/note`, { note }), "Note added")) setNote("");
      }}
    >
      <Input placeholder="Add a repair note…" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Repair note" />
      <Button type="submit" variant="outline" disabled={busy !== null || !note.trim()}>
        Add
      </Button>
    </form>
  );
}

export function CostForm({ ticketId, currency }: { ticketId: string; currency: string }) {
  const { busy, run } = useAction();
  const today = new Date().toISOString().slice(0, 10);
  const [v, setV] = useState({ partsCost: "", labourCost: "", otherCost: "", currency, expenseDate: today, notes: "" });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form
      className="grid grid-cols-3 gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run(
          "cost",
          () => post(`/api/tickets/${ticketId}/cost`, { ...v, partsCost: v.partsCost || "0", labourCost: v.labourCost || "0", otherCost: v.otherCost || "0", notes: v.notes || null }),
          "Expense recorded (total calculated by the server)",
        );
        if (ok) setV({ ...v, partsCost: "", labourCost: "", otherCost: "", notes: "" });
      }}
    >
      <Input inputMode="decimal" placeholder="Parts" value={v.partsCost} onChange={set("partsCost")} aria-label="Parts cost" />
      <Input inputMode="decimal" placeholder="Labour" value={v.labourCost} onChange={set("labourCost")} aria-label="Labour cost" />
      <Input inputMode="decimal" placeholder="Other" value={v.otherCost} onChange={set("otherCost")} aria-label="Other cost" />
      <Input value={v.currency} maxLength={3} onChange={set("currency")} aria-label="Currency" />
      <Input type="date" className="col-span-2" value={v.expenseDate} onChange={set("expenseDate")} aria-label="Expense date" />
      <Input className="col-span-3" placeholder="Notes (optional)" value={v.notes} onChange={set("notes")} aria-label="Expense notes" />
      <Button type="submit" variant="outline" className="col-span-3" disabled={busy !== null}>
        Record expense
      </Button>
    </form>
  );
}

export function DuplicateReviewControls({ ticketId, suggested }: { ticketId: string; suggested: { id: string; ticket_number: string; title: string } | null }) {
  const { busy, run } = useAction();
  return (
    <div className="flex flex-wrap gap-2">
      {suggested ? (
        <Button disabled={busy !== null} onClick={() => run("merge", () => post(`/api/tickets/${ticketId}/merge`, { targetTicketId: suggested.id }), `Merged into ${suggested.ticket_number}`)}>
          Same problem — merge into {suggested.ticket_number}
        </Button>
      ) : null}
      <Button variant="outline" disabled={busy !== null} onClick={() => run("separate", () => post(`/api/tickets/${ticketId}/keep-separate`, {}), "Kept as a separate ticket")}>
        Different problem — keep separate
      </Button>
    </div>
  );
}
