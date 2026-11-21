import { AlertTriangle, Eye } from "lucide-react";

export function LevelBadge({ level }: { level: "replacement_review" | "watch" | "ok" }) {
  if (level === "replacement_review")
    return (
      <span className="inline-flex items-center gap-1 border border-[#eb1937] bg-[#d70015] px-2 py-[3px] text-[11.5px] font-medium tracking-[0.02em] text-white">
        <AlertTriangle className="size-3" aria-hidden /> Replacement review
      </span>
    );
  if (level === "watch")
    return (
      <span className="inline-flex items-center gap-1 border border-[#fed7aa] bg-[#fff7ed] px-2 py-[3px] text-[11.5px] font-medium tracking-[0.02em] text-[#b45309]">
        <Eye className="size-3" aria-hidden /> Watch
      </span>
    );
  return <span className="text-xs text-muted-foreground">OK</span>;
}


