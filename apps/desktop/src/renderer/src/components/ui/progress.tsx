import type { ComponentProps } from "react"
import { clampPercent } from "@renderer/lib/format"
import { cn } from "@renderer/lib/utils"

export interface ProgressProps extends ComponentProps<"div"> {
  value?: number
  indicatorClassName?: string
}

export function Progress({ value = 0, className, indicatorClassName, ...props }: ProgressProps) {
  const percent = clampPercent(value)
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-secondary", className)}
      {...props}
    >
      <div
        className={cn("h-full rounded-full bg-primary transition-[width] duration-300 ease-out", indicatorClassName)}
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}
