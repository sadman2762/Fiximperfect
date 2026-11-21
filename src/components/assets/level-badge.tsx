import { AlertTriangle, Eye } from "lucide-react";

export function LevelBadge({ level }: { level: "replacement_review" | "watch" | "ok" }) {
  if (level === "replacement_review")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#d03b3b] px-2 py-0.5 text-xs font-medium text-white">
        <AlertTriangle className="size-3" aria-hidden /> Replacement review
      </span>
    );
  if (level === "watch")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#fab219]/20 px-2 py-0.5 text-xs font-medium text-[#854d0e] ring-1 ring-[#fab219]/60">
        <Eye className="size-3" aria-hidden /> Watch
      </span>
    );
  return <span className="text-xs text-muted-foreground">OK</span>;
}

