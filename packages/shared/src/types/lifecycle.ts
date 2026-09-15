import type { JobStatus, StageId } from "../schemas"

export interface ProgressPayload {
  jobId: string
  stageId: StageId
  percent: number
  message?: string
}

export type StageRunState = "pending" | "running" | "completed" | "failed" | "cancelled"

export interface StageStatus {
  stageId: StageId
  state: StageRunState
  percent: number
  message?: string
  startedAt?: number
  completedAt?: number
}

export interface JobLifecycleSnapshot {
  jobId: string
  status: JobStatus
  stages: StageStatus[]
  updatedAt: number
}

export interface CancellationSignal {
  readonly aborted: boolean
  readonly reason?: string
  signal: AbortSignal
  requestCancel: (reason?: string) => void
  throwIfAborted: () => void
}

export type StageErrorCode =
  | "validation"
  | "provider_unavailable"
  | "provider_timeout"
  | "quality_gate"
  | "circuit_open"
  | "cancelled"
  | "internal"

export interface StageError {
  code: StageErrorCode
  stageId: StageId
  message: string
  retryable: boolean
  details?: Record<string, unknown>
}
