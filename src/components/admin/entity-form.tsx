"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/shared/ui-bits";

export type Field =
  | { name: string; label: string; type: "text" | "number" | "date" | "email" | "password"; placeholder?: string; required?: boolean }
  | { name: string; label: string; type: "select"; options: { value: string; label: string }[]; required?: boolean }
  | { name: string; label: string; type: "multi"; options: { value: string; label: string }[] }
  | { name: string; label: string; type: "checkbox" }
  | { name: string; label: string; type: "list"; placeholder?: string };

type Values = Record<string, string | boolean | string[]>;

export function EntityForm({
  endpoint,
  fields,
  initial,
  id,
  submitLabel = "Create",
  onDone,
}: {
  endpoint: string;
  fields: Field[];
  initial?: Values;
  id?: string;
  submitLabel?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const blank: Values = Object.fromEntries(fields.map((f) => [f.name, f.type === "checkbox" ? false : f.type === "multi" ? [] : ""]));
  const [v, setV] = useState<Values>({ ...blank, ...initial });
  const [busy, setBusy] = useState(false);

  const payload = () => {
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      const val = v[f.name];
      if (f.type === "list") out[f.name] = String(val ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      else if (f.type === "number") out[f.name] = val === "" ? null : Number(val);
      else if (f.type === "select" && val === "") out[f.name] = null;
      else out[f.name] = val;
    }
    return out;
  };

  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await fetch(endpoint, {
          method: id ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(id ? { id, values: payload() } : payload()),
        });
        const body = await res.json().catch(() => ({}));
        setBusy(false);
        if (!res.ok) {
          toast.error(body.issues ? body.issues.map((i: { path: string; message: string }) => `${i.path}: ${i.message}`).join("; ") : (body.error ?? "Save failed"));
          return;
        }
        toast.success(id ? "Saved" : "Created");
        if (!id) setV(blank);
        onDone?.();
        router.refresh();
      }}
    >
      {fields.map((f) => (
        <div key={f.name} className={f.type === "multi" ? "space-y-1 sm:col-span-2 lg:col-span-3" : "space-y-1"}>
          {f.type === "checkbox" ? (
            <label className="flex items-center gap-2 pt-6 text-sm">
              <input type="checkbox" checked={Boolean(v[f.name])} onChange={(e) => setV({ ...v, [f.name]: e.target.checked })} /> {f.label}
            </label>
          ) : (
            <>
              <Label htmlFor={`${endpoint}-${f.name}`}>{f.label}</Label>
              {f.type === "select" ? (
                <NativeSelect id={`${endpoint}-${f.name}`} value={String(v[f.name] ?? "")} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} required={f.required}>
                  <option value="">—</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </NativeSelect>
              ) : f.type === "multi" ? (
                <div className="flex flex-wrap gap-3 rounded-lg border p-2">
                  {f.options.map((o) => {
                    const arr = (v[f.name] as string[]) ?? [];
                    return (
                      <label key={o.value} className="flex items-center gap-1.5 text-sm">
                        <input
                          type="checkbox"
                          checked={arr.includes(o.value)}
                          onChange={(e) => setV({ ...v, [f.name]: e.target.checked ? [...arr, o.value] : arr.filter((x) => x !== o.value) })}
                        />
                        {o.label}
                      </label>
                    );
                  })}
                </div>
              ) : (
                <Input
                  id={`${endpoint}-${f.name}`}
                  type={f.type === "list" ? "text" : f.type}
                  step={f.type === "number" ? "any" : undefined}
                  placeholder={"placeholder" in f ? f.placeholder : undefined}
                  required={"required" in f ? f.required : undefined}
                  value={Array.isArray(v[f.name]) ? (v[f.name] as string[]).join(", ") : String(v[f.name] ?? "")}
                  onChange={(e) => setV({ ...v, [f.name]: e.target.value })}
                />
              )}
            </>
          )}
        </div>
      ))}
      <div className="flex items-end">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function DeleteButton({ endpoint, id, label = "Delete" }: { endpoint: string; id: string; label?: string }) {
  const router = useRouter();
  return (
    <button
      className="text-xs text-destructive hover:underline"
      onClick={async () => {
        if (!confirm("Delete this record? This cannot be undone.")) return;
        const res = await fetch(`${endpoint}?id=${id}`, { method: "DELETE" });
        const body = await res.json().catch(() => ({}));
        if (res.ok) {
          toast.success("Deleted");
          router.refresh();
        } else toast.error(body.error ?? "Delete failed");
      }}
    >
      {label}
    </button>
  );
}

export function EditToggle({ children, label = "Edit" }: { children: React.ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <div className="mt-2 rounded-lg border bg-muted/30 p-3">
      {children}
      <button className="mt-2 text-xs text-muted-foreground hover:underline" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  ) : (
    <button className="text-xs text-primary hover:underline" onClick={() => setOpen(true)}>
      {label}
    </button>
  );
}
