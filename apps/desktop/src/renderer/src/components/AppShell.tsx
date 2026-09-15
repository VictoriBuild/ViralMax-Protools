import type { ReactNode } from "react"
import { Activity, Download, Settings, Sparkles, Wifi, WifiOff } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Badge } from "@renderer/components/ui/badge"
import { useOnlineStatus } from "@renderer/hooks/useOnlineStatus"
import { cn } from "@renderer/lib/utils"
import { useAuthStore } from "@renderer/store/useAuthStore"

export type ViewId = "ingest" | "monitor" | "results" | "settings"

interface NavItem {
  id: ViewId
  label: string
  icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { id: "ingest", label: "Ingest", icon: Download },
  { id: "monitor", label: "Monitor", icon: Activity },
  { id: "results", label: "Results", icon: Sparkles },
  { id: "settings", label: "Settings", icon: Settings }
]

export interface AppShellProps {
  view: ViewId
  onViewChange: (view: ViewId) => void
  children: ReactNode
}

export function AppShell({ view, onViewChange, children }: AppShellProps) {
  const online = useOnlineStatus()
  const balance = useAuthStore((state) => state.balance)
  const currency = useAuthStore((state) => state.currency)

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-card">
        <div className="flex items-center gap-2 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">MediaSuite</p>
            <p className="text-xs text-muted-foreground">Local-first mining</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-2 py-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = view === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onViewChange(item.id)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            )
          })}
        </nav>
        <div className="border-t border-border p-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            {online ? <Wifi className="h-3.5 w-3.5 text-emerald-500" /> : <WifiOff className="h-3.5 w-3.5 text-amber-500" />}
            {online ? "Online" : "Offline"}
          </span>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
          <h1 className="text-sm font-semibold capitalize">{view === "ingest" ? "Ingest media" : view}</h1>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Badge variant="outline">
              {balance.toFixed(2)} {currency.toUpperCase()} credits
            </Badge>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
