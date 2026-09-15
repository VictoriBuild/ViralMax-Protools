import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"

export function Progress({ value, className, ...props }: ComponentProps<"div"> & { value: number }) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-secondary", className)}
      {...props}
    >
      <div className="h-full w-full flex-1 bg-primary transition-all" style={{ transform: `translateX(-${100 - clamped}%)` }} />
    </div>
  )
}
