import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-xl border border-[#dde2e5] bg-white px-3.5 py-2.5 text-base transition-colors outline-none placeholder:text-[#8e9cab] focus-visible:border-[#00866a] focus-visible:ring-4 focus-visible:ring-[#00866a]/15 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-[#dc2626] md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
