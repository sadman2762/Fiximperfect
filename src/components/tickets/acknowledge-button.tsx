"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function AcknowledgeButton({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      className="rounded-xl bg-white px-3 py-1.5 text-sm font-semibold text-[#aa0014] hover:bg-white/90 disabled:opacity-60"
      onClick={async () => {
        setBusy(true);
        const res = await fetch(`/api/tickets/${ticketId}/acknowledge`, { method: "POST" });
        setBusy(false);
        if (res.ok) {
          toast.success("Emergency acknowledged — escalation stopped.");
          router.refresh();
        } else toast.error((await res.json().catch(() => ({}))).error ?? "Could not acknowledge");
      }}
    >
      {busy ? "Acknowledging…" : "Acknowledge"}
    </button>
  );
}

