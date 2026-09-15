import type { Engine, StageId, VideoSource } from "@repo/shared"
import type { StageOutputOf } from "@repo/shared"

export interface PipelineRunStateOptions {
  jobId: string
  source: VideoSource
  engine: Engine
}

export class PipelineRunState {
  readonly jobId: string
  readonly source: VideoSource
  readonly engine: Engine
  private readonly outputs = new Map<StageId, unknown>()

  constructor(options: PipelineRunStateOptions) {
    this.jobId = options.jobId
    this.source = options.source
    this.engine = options.engine
  }

  hasOutput(stageId: StageId): boolean {
    return this.outputs.has(stageId)
  }

  getOutput<ID extends StageId>(stageId: ID): StageOutputOf<ID> | undefined {
    return this.outputs.get(stageId) as StageOutputOf<ID> | undefined
  }

  setOutput<ID extends StageId>(stageId: ID, output: StageOutputOf<ID>): void {
    this.outputs.set(stageId, output)
  }

  completedStageIds(): StageId[] {
    return [...this.outputs.keys()]
  }

  toSnapshotOutputs(): Partial<Record<StageId, unknown>> {
    return Object.fromEntries(this.outputs.entries()) as Partial<Record<StageId, unknown>>
  }

  restoreOutputs(outputs: Partial<Record<StageId, unknown>>): void {
    for (const [stageId, output] of Object.entries(outputs)) {
      this.outputs.set(stageId as StageId, output)
    }
  }
}
