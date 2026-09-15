import type { Engine, StageId } from "@repo/shared"
import type { StageInputOf, StageOutputOf } from "@repo/shared"
import type { CancellationSignal } from "@repo/shared"
import type { ExecutionEnv } from "./env"

export interface ValidationResult {
  ok: boolean
  errors?: string[]
}

export interface StageRuntime<ID extends StageId = StageId> {
  readonly jobId: string
  readonly stageId: ID
  readonly engine: Engine
  readonly signal: CancellationSignal
  readonly workspaceDir: string
  readonly tempDir: string
  reportProgress: (percent: number, message?: string) => void
  trackArtifact: (path: string) => void
  untrackArtifact: (path: string) => void
}

export interface PipelineStage<ID extends StageId = StageId> {
  readonly id: ID
  readonly version: string
  readonly execution: ExecutionEnv
  readonly description: string
  validate: (input: unknown) => ValidationResult | Promise<ValidationResult>
  run: (runtime: StageRuntime<ID>, input: StageInputOf<ID>) => Promise<StageOutputOf<ID>>
}
