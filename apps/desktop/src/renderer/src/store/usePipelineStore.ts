import { create } from "zustand"
import type { Engine, Job, NativeProgress, StageId, StageRunState, VideoSource } from "@repo/shared"
import { STAGE_LABELS } from "@renderer/lib/constants"
import { useSettingsStore } from "./useSettingsStore"

export interface StageProgress {
  state: StageRunState
  percent: number
  message?: string
}

export interface LogEntry {
  id: string
  at: number
  level: "info" | "warn" | "error"
  message: string
}

interface PipelineState {
  queue: Job[]
  activeJobId: string | null
  stageProgress: Partial<Record<StageId, StageProgress>>
  logs: LogEntry[]
  nativeProgress: NativeProgress | null
  busy: boolean
  error: string | null
  start: (source: VideoSource, engine?: Engine) => Promise<boolean>
  cancelActive: () => Promise<void>
  reset: () => void
  bindEvents: () => () => void
}

let logSequence = 0

function upsertJob(queue: Job[], job: Job): Job[] {
  const index = queue.findIndex((entry) => entry.id === job.id)
  if (index === -1) {
    return [job, ...queue].slice(0, 50)
  }
  const next = [...queue]
  next[index] = job
  return next
}

function appendLog(logs: LogEntry[], level: LogEntry["level"], message: string): LogEntry[] {
  const last = logs[logs.length - 1]
  if (last && last.message === message) {
    return logs
  }
  logSequence += 1
  const entry: LogEntry = { id: `log-${logSequence}`, at: Date.now(), level, message }
  const next = [...logs, entry]
  return next.length > 200 ? next.slice(next.length - 200) : next
}

function statusLog(job: Job): { level: LogEntry["level"]; message: string } {
  switch (job.status) {
    case "running":
      return { level: "info", message: `Job started (${job.engine} engine)` }
    case "completed":
      return { level: "info", message: "Job completed" }
    case "cancelled":
      return { level: "warn", message: "Job cancelled" }
    case "failed":
      return { level: "error", message: `Job failed: ${job.error ?? "unknown error"}` }
    default:
      return { level: "info", message: "Job queued" }
  }
}

export const usePipelineStore = create<PipelineState>((set, get) => ({
  queue: [],
  activeJobId: null,
  stageProgress: {},
  logs: [],
  nativeProgress: null,
  busy: false,
  error: null,

  start: async (source, engineOverride) => {
    const engine = engineOverride ?? useSettingsStore.getState().settings?.defaultEngine ?? "local"
    set({ busy: true, error: null, stageProgress: {}, logs: [], nativeProgress: null })
    const result = await window.api.job.create({ source, engine })
    if (!result.ok) {
      set({ busy: false, error: result.message })
      return false
    }
    set((state) => ({
      activeJobId: result.value.id,
      queue: upsertJob(state.queue, result.value)
    }))
    return true
  },

  cancelActive: async () => {
    const jobId = get().activeJobId
    if (!jobId) {
      return
    }
    const result = await window.api.job.cancel(jobId)
    if (!result.ok) {
      set({ error: result.message })
    }
  },

  reset: () => {
    set({ activeJobId: null, stageProgress: {}, logs: [], nativeProgress: null, busy: false, error: null })
  },

  bindEvents: () => {
    const offStatus = window.api.events.onJobStatusChanged(({ status }) => {
      const { level, message } = statusLog(status)
      set((state) => {
        const isActive = state.activeJobId === null || state.activeJobId === status.id
        return {
          queue: upsertJob(state.queue, status),
          activeJobId: state.activeJobId ?? status.id,
          busy: isActive ? status.status === "queued" || status.status === "running" : state.busy,
          logs: isActive ? appendLog(state.logs, level, message) : state.logs
        }
      })
    })

    const offProgress = window.api.events.onPipelineProgress((payload) => {
      const { activeJobId } = get()
      if (activeJobId && payload.jobId !== activeJobId) {
        return
      }
      set((state) => {
        const progress: StageProgress = {
          state: payload.percent >= 100 ? "completed" : "running",
          percent: payload.percent,
          message: payload.message
        }
        const shouldLog = payload.percent === 0 || payload.percent >= 100
        const logMessage =
          payload.percent === 0
            ? `${STAGE_LABELS[payload.stageId]} started`
            : `${STAGE_LABELS[payload.stageId]} completed`
        return {
          stageProgress: { ...state.stageProgress, [payload.stageId]: progress },
          logs: shouldLog ? appendLog(state.logs, "info", logMessage) : state.logs
        }
      })
    })

    const offNative = window.api.events.onNativeProgress((payload) => {
      set({ nativeProgress: payload })
    })

    const offArtifact = window.api.events.onPipelineArtifact((payload) => {
      set((state) => ({
        logs: appendLog(state.logs, "info", `Artifact produced: ${payload.artifact.path}`)
      }))
    })

    return () => {
      offStatus()
      offProgress()
      offNative()
      offArtifact()
    }
  }
}))
