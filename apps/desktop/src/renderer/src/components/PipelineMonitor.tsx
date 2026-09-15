import { AlertCircle, CheckCircle2, Circle, Loader2, Square, Sparkles, XCircle } from "lucide-react"
import type { StageId, StageRunState } from "@repo/shared"
import { Badge } from "@renderer/components/ui/badge"
import { Button } from "@renderer/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@renderer/components/ui/card"
import { Progress } from "@renderer/components/ui/progress"
import { STAGE_LABELS, STAGE_ORDER } from "@renderer/lib/constants"
import { cn } from "@renderer/lib/utils"
import { usePipelineStore } from "@renderer/store/usePipelineStore"
import type { StageProgress } from "@renderer/store/usePipelineStore"

export interface PipelineMonitorProps {
  onViewResults: () => void
}

const STATE_BADGE: Record<StageRunState, { label: string; variant: "secondary" | "success" | "destructive" | "warning" | "outline" }> = {
  pending: { label: "Pending", variant: "outline" },
  running: { label: "Running", variant: "warning" },
  completed: { label: "Done", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "destructive" }
}

function stageStateFor(
  stageId: StageId,
  planned: StageId[],
  progress: Partial<Record<StageId, StageProgress>>,
  currentStage: StageId | undefined,
  jobStatus: string | undefined
): StageRunState {
  const entry = progress[stageId]
  if (entry) {
    return entry.state
  }
  if (!planned.includes(stageId)) {
    return "pending"
  }
  if (jobStatus === "cancelled") {
    return "cancelled"
  }
  if (currentStage === stageId && jobStatus === "failed") {
    return "failed"
  }
  return "pending"
}

export function PipelineMonitor({ onViewResults }: PipelineMonitorProps) {
  const activeJob = usePipelineStore((state) => state.queue.find((job) => job.id === state.activeJobId) ?? null)
  const stageProgress = usePipelineStore((state) => state.stageProgress)
  const logs = usePipelineStore((state) => state.logs)
  const nativeProgress = usePipelineStore((state) => state.nativeProgress)
  const busy = usePipelineStore((state) => state.busy)
  const cancelActive = usePipelineStore((state) => state.cancelActive)

  if (!activeJob) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
        <Sparkles className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium">No active pipeline</p>
        <p className="text-xs text-muted-foreground">Start a job from the Ingest view to watch its stages here.</p>
      </div>
    )
  }

  const planned = activeJob.stages
  const completedCount = planned.filter((stageId) => stageProgress[stageId]?.state === "completed").length
  const overall = planned.length
    ? Math.round(
        planned.reduce((sum, stageId) => {
          const entry = stageProgress[stageId]
          if (entry) {
            return sum + entry.percent
          }
          return sum + (activeJob.status === "completed" ? 100 : 0)
        }, 0) / planned.length
      )
    : 0
  const canCancel = activeJob.status === "queued" || activeJob.status === "running" || busy

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>Pipeline monitor</CardTitle>
            <CardDescription>
              {activeJob.source.kind === "url" ? activeJob.source.url : activeJob.source.path}
            </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant={activeJob.status === "completed" ? "success" : activeJob.status === "failed" ? "destructive" : "secondary"}>
              {activeJob.status}
            </Badge>
            <span className="text-xs text-muted-foreground capitalize">{activeJob.engine} engine</span>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {completedCount} of {planned.length} stages complete
              </span>
              <span>{overall}%</span>
            </div>
            <Progress value={overall} />
          </div>

          {nativeProgress ? (
            <div className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium capitalize">{nativeProgress.kind}</span>
                <span className="text-muted-foreground">{Math.round(nativeProgress.percent)}%</span>
              </div>
              <Progress value={nativeProgress.percent} indicatorClassName="bg-amber-500" />
              {nativeProgress.message ? (
                <span className="truncate text-xs text-muted-foreground">{nativeProgress.message}</span>
              ) : null}
            </div>
          ) : null}

          <ol className="flex flex-col gap-2">
            {STAGE_ORDER.map((stageId) => {
              const state = stageStateFor(stageId, planned, stageProgress, activeJob.currentStage, activeJob.status)
              const inPlan = planned.includes(stageId)
              const percent = stageProgress[stageId]?.percent ?? (state === "completed" ? 100 : 0)
              const Icon =
                state === "completed"
                  ? CheckCircle2
                  : state === "running"
                    ? Loader2
                    : state === "failed"
                      ? XCircle
                      : state === "cancelled"
                        ? AlertCircle
                        : Circle
              return (
                <li
                  key={stageId}
                  className={cn(
                    "flex items-center gap-3 rounded-md border px-3 py-2",
                    state === "running" ? "border-amber-500/40 bg-amber-500/5" : "border-border",
                    !inPlan && "opacity-50"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      state === "completed" && "text-emerald-500",
                      state === "running" && "animate-spin text-amber-500",
                      state === "failed" && "text-destructive",
                      state === "cancelled" && "text-destructive",
                      state === "pending" && "text-muted-foreground"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {STAGE_LABELS[stageId]}
                        {!inPlan ? " (skipped)" : ""}
                      </span>
                      <Badge variant={inPlan ? STATE_BADGE[state].variant : "outline"}>
                        {inPlan ? STATE_BADGE[state].label : "Skipped"}
                      </Badge>
                    </div>
                    {state === "running" ? (
                      <Progress value={percent} className="mt-1.5 h-1" />
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ol>

          {activeJob.error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{activeJob.error}</p>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            {canCancel ? (
              <Button variant="outline" onClick={() => void cancelActive()}>
                <Square className="h-4 w-4" />
                Cancel
              </Button>
            ) : null}
            {activeJob.status === "completed" ? (
              <Button onClick={onViewResults}>
                <Sparkles className="h-4 w-4" />
                View results
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live log</CardTitle>
          <CardDescription>Stage and tool activity streamed from the main process.</CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-xs text-muted-foreground">Waiting for pipeline activity...</p>
          ) : (
            <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto font-mono text-xs">
              {logs
                .slice()
                .reverse()
                .map((entry) => (
                  <li key={entry.id} className="flex gap-2">
                    <span className="shrink-0 text-muted-foreground">{new Date(entry.at).toLocaleTimeString()}</span>
                    <span
                      className={cn(
                        entry.level === "error" && "text-destructive",
                        entry.level === "warn" && "text-amber-500",
                        entry.level === "info" && "text-foreground"
                      )}
                    >
                      {entry.message}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
