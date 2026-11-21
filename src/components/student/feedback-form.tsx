"use client";

import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * The answer from the email link is only pre-selected; the student must press
 * submit (a POST), so email link scanners/prefetchers can't answer on their behalf.
 */
export function FeedbackForm({ token, initial }: { token: string; initial: "fixed" | "still_broken" | null }) {
  const [answer, setAnswer] = useState<"fixed" | "still_broken" | null>(initial);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  if (state === "done") {
    return (
      <p role="status" className="mt-4 rounded-xl bg-[#e6f4f0] p-3 text-sm text-[#006b55]">
        {answer === "fixed" ? "Thank you for confirming the repair!" : "Thanks for telling us. The ticket has been reopened and the maintenance team has been notified."}
      </p>
    );
  }
  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!answer) return;
        setState("sending");
        const res = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, response: answer, comment: comment || null }) });
        const body = await res.json().catch(() => ({}));
        if (res.ok) setState("done");
        else {
          setState("error");
          setError(body.error ?? "Could not save your answer.");
        }
      }}
    >
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Is it fixed?">
        <button
          type="button"
          role="radio"
          aria-checked={answer === "fixed"}
          onClick={() => setAnswer("fixed")}
          className={cn("flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium", answer === "fixed" ? "border-[#00866a] bg-[#e6f4f0] text-[#006b55]" : "hover:bg-muted")}
        >
          <CheckCircle2 className="size-5" aria-hidden /> Yes, fixed
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={answer === "still_broken"}
          onClick={() => setAnswer("still_broken")}
          className={cn("flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium", answer === "still_broken" ? "border-[#dc2626] bg-[#fef2f2] text-[#991b1b]" : "hover:bg-muted")}
        >
          <XCircle className="size-5" aria-hidden /> No, still broken
        </button>
      </div>
      {answer === "still_broken" ? (
        <Textarea placeholder="What is still wrong? (optional)" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} maxLength={2000} />
      ) : null}
      {state === "error" ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={!answer || state === "sending"}>
        {state === "sending" ? "Saving…" : "Submit answer"}
      </Button>
    </form>
  );
}
