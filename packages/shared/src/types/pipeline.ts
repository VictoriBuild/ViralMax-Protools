import type { Engine, JobStatus } from "../schemas"

export type StageExecution = "local" | "cloud"

export interface StageArtifact {
  path: string
  mimeType: string
  sizeBytes: number
}

export interface PipelineProgress {
  stage: string
  percent: number
  message?: string
}

export interface PipelineEventMap {
  started: { jobId: string; at: number }
  progress: { jobId: string; progress: PipelineProgress }
  artifact: { jobId: string; stage: string; artifact: StageArtifact }
  completed: { jobId: string; at: number }
  failed: { jobId: string; error: string }
  cancelled: { jobId: string }
}

export type PipelineEvent = {
  [K in keyof PipelineEventMap]: { type: K } & PipelineEventMap[K]
}[keyof PipelineEventMap]

export interface PipelineJobMeta {
  id: string
  engine: Engine
  status: JobStatus
  stages: string[]
}
