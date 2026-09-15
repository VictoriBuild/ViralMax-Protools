import type { Engine } from "@repo/shared"
import type { StageContext } from "../contract/stage"
import type { StageRegistry } from "./registry"

export interface JobExecutionRequest<I> {
  jobId: string
  engine: Engine
  input: I
  stageIds: string[]
  signal?: AbortSignal
  env?: unknown
}

export interface StageRunResult {
  stageId: string
  artifacts: unknown[]
}

export interface JobExecutionResult {
  jobId: string
  completedStages: string[]
  failedStage?: { stage: string; error: string }
  stages: StageRunResult[]
}

export class PipelineEngine {
  constructor(private readonly registry: StageRegistry) {}

  async run<I>(request: JobExecutionRequest<I>): Promise<JobExecutionResult> {
    const completedStages: string[] = []
    const stageResults: StageRunResult[] = []
    let input: unknown = request.input

    for (const stageId of request.stageIds) {
      const stage = this.registry.resolve(stageId)
      const ctx: StageContext<unknown> = {
        env: request.env,
        workspaceDir: "",
        tempDir: "",
        signal: request.signal ?? new AbortController().signal,
        engine: request.engine,
        emit: () => {}
      }

      const validation = await stage.validate(input)
      if (!validation.ok) {
        return {
          jobId: request.jobId,
          completedStages,
          failedStage: {
            stage: stageId,
            error: validation.errors?.join("; ") ?? "stage input validation failed"
          },
          stages: stageResults
        }
      }

      const artifacts: unknown[] = []
      try {
        for await (const event of stage.run(ctx, input)) {
          if (event.type === "artifact") {
            artifacts.push(event.artifact)
          }
          if (request.signal?.aborted) {
            throw new Error("job aborted")
          }
        }
      } catch (error) {
        return {
          jobId: request.jobId,
          completedStages,
          failedStage: {
            stage: stageId,
            error: error instanceof Error ? error.message : String(error)
          },
          stages: stageResults
        }
      }

      stageResults.push({ stageId, artifacts })
      completedStages.push(stageId)
      const lastArtifact = artifacts.at(-1)
      if (lastArtifact !== undefined) {
        input = lastArtifact
      }
    }

    return { jobId: request.jobId, completedStages, stages: stageResults }
  }
}
