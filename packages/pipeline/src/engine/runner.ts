import { tmpdir } from "node:os"
import { isAbsolute, join, relative, resolve } from "node:path"
import { unlink } from "node:fs/promises"
import type {
  AcquisitionOutput,
  Clips,
  CloudContext,
  Engine,
  JobStatus,
  Knowledge,
  LocalContext,
  MediaMetadata,
  ProgressPayload,
  StageError,
  StageId,
  StageOutputOf,
  StageStatus,
  Transcript,
  TranscriptImportOutput,
  VideoSource
} from "@repo/shared"
import { VideoSourceSchema } from "@repo/shared"
import type { StageRuntime } from "../contract/stage"
import { StageExecutionError, toStageError } from "../contract/errors"
import type { StageRegistry } from "./registry"
import { createCancellationSignal } from "./cancellation"
import type { CancellationSignal } from "@repo/shared"
import { PipelineRunState } from "./state"
import { buildPlan, orderedStages, type PipelinePlan, type SelectorStageId } from "./pathways"
import type { SnapshotStore } from "./snapshot"
import { InMemorySnapshotStore } from "./snapshot"

export interface PipelineRunnerOptions {
  onProgress?: (progress: ProgressPayload) => void
  onStageChange?: (status: StageStatus) => void
  store?: SnapshotStore
  retryDelaysMs?: number[]
}

export interface RunPipelineRequest {
  jobId: string
  source: VideoSource
  engine: Engine
  localContext?: LocalContext
  cloudContext?: CloudContext
  workspaceDir?: string
  tempDir?: string
  signal?: AbortSignal
  plan?: PipelinePlan
  resume?: boolean
}

export interface PipelineRunResult {
  jobId: string
  engine: Engine
  status: JobStatus
  plannedStages: StageId[]
  completedStages: StageId[]
  currentStage?: StageId
  selector: SelectorStageId
  clips?: Clips
  transcript?: Transcript
  knowledge?: Knowledge
  metadata?: MediaMetadata
  error?: StageError
  resumed: boolean
}

interface RunningStage {
  stageId: StageId
  artifacts: string[]
}

export class PipelineRunner {
  private readonly retryDelaysMs: number[]
  private readonly defaultStore = new InMemorySnapshotStore()

  constructor(
    private readonly registry: StageRegistry,
    private readonly options: PipelineRunnerOptions = {}
  ) {
    this.retryDelaysMs = options.retryDelaysMs ?? [50, 250]
  }

  private get store(): SnapshotStore {
    return this.options.store ?? this.defaultStore
  }

  async run(request: RunPipelineRequest): Promise<PipelineRunResult> {
    if (request.plan && request.plan.engine !== request.engine) {
      throw new TypeError(`plan engine (${request.plan.engine}) does not match request engine (${request.engine})`)
    }
    const plan: PipelinePlan = request.plan ?? buildPlan(request)

    if (plan.blockers.length > 0) {
      return {
        jobId: request.jobId,
        engine: request.engine,
        status: "failed",
        plannedStages: orderedStages(plan),
        completedStages: [],
        selector: plan.selector,
        error: {
          code: "validation",
          stageId: plan.selector,
          message: plan.blockers.join("; "),
          retryable: false
        },
        resumed: false
      }
    }

    const parsedSource = VideoSourceSchema.safeParse(request.source)
    if (!parsedSource.success) {
      return {
        jobId: request.jobId,
        engine: request.engine,
        status: "failed",
        plannedStages: orderedStages(plan),
        completedStages: [],
        selector: plan.selector,
        error: {
          code: "validation",
          stageId: plan.selector,
          message: "source is not a valid video source",
          retryable: false,
          details: { issues: parsedSource.error.issues }
        },
        resumed: false
      }
    }

    const source = parsedSource.data
    const cancellation = createCancellationSignal(request.signal)
    const state = new PipelineRunState({ jobId: request.jobId, source, engine: request.engine })
    const stageIds = orderedStages(plan)
    const workspaceDir = resolve(request.workspaceDir ?? join(tmpdir(), "mediasuite", request.jobId))
    const tempDir = resolve(request.tempDir ?? join(workspaceDir, "tmp"))

    for (const stageId of stageIds) {
      this.emitStage({ stageId, state: "pending", percent: 0 })
    }

    let resumed = false
    if (request.resume !== false) {
      const snapshot = await this.store.load(request.jobId)
      if (snapshot) {
        state.restoreOutputs(snapshot.outputs)
        resumed = true
      }
    }

    const jobId = request.jobId
    const startStage = (stageId: StageId): void => {
      this.options.onProgress?.({ jobId, stageId, percent: 0, message: "stage started" })
    }
    const completeStage = (stageId: StageId): void => {
      this.options.onProgress?.({ jobId, stageId, percent: 100, message: "stage completed" })
      this.emitStage({ stageId, state: "completed", percent: 100, completedAt: Date.now() })
    }

    const failOrCancel = async (running: RunningStage | undefined): Promise<void> => {
      if (running) {
        await this.cleanupStageArtifacts(running, workspaceDir)
      }
      await this.persist(state, request)
    }

    let running: RunningStage | undefined

    for (const stageId of stageIds) {
      try {
        cancellation.throwIfAborted()
      } catch {
        await failOrCancel(undefined)
        return this.cancelledResult(request, plan, stageIds, state, undefined, resumed)
      }
      if (state.hasOutput(stageId)) {
        continue
      }

      const stage = this.registry.resolve(stageId)
      const attempts = this.retryDelaysMs.length + 1
      let attempt = 0

      for (;;) {
        attempt += 1
        running = { stageId, artifacts: [] }
        startStage(stageId)
        this.emitStage({ stageId, state: "running", percent: 0, startedAt: Date.now() })

        let output: unknown
        try {
          const input = this.buildInput(stageId, state, source, request.localContext)
          const validation = await stage.validate(input)
          if (!validation.ok) {
            throw new StageExecutionError({
              stageId,
              code: "validation",
              message: validation.errors?.join("; ") ?? "stage input validation failed",
              retryable: false
            })
          }
          const runtime = this.createRuntime(request, plan, stageId, running, workspaceDir, tempDir, cancellation)
          output = await stage.run(runtime, input as never)
        } catch (cause) {
          const error = toStageError(stageId, cause)
          if (cancellation.aborted || error.code === "cancelled") {
            await failOrCancel(running)
            return this.cancelledResult(request, plan, stageIds, state, stageId, resumed)
          }
          if (error.retryable && attempt < attempts) {
            try {
              await this.delayRetry(cancellation, attempt)
            } catch {
              await failOrCancel(running)
              return this.cancelledResult(request, plan, stageIds, state, stageId, resumed)
            }
            continue
          }
          await failOrCancel(running)
          this.emitStage({ stageId, state: "failed", percent: 0, message: error.message, completedAt: Date.now() })
          return {
            jobId: request.jobId,
            engine: request.engine,
            status: "failed",
            plannedStages: stageIds,
            completedStages: stageIds.filter((id) => state.hasOutput(id)),
            currentStage: stageId,
            selector: plan.selector,
            error,
            resumed
          }
        }

        running.artifacts = []
        state.setOutput(stageId, output as StageOutputOf<StageId>)
        await this.persist(state, request)
        completeStage(stageId)
        break
      }
    }

    await this.store.clear(request.jobId)

    const completedStages = stageIds.filter((id) => state.hasOutput(id))
    const selectorOutput = state.getOutput(plan.selector)
    return {
      jobId: request.jobId,
      engine: request.engine,
      status: "completed",
      plannedStages: stageIds,
      completedStages,
      selector: plan.selector,
      clips: selectorOutput as Clips | undefined,
      ...this.collectResultOutputs(state),
      resumed
    }
  }

  private collectResultOutputs(state: PipelineRunState): {
    transcript?: Transcript
    knowledge?: Knowledge
    metadata?: MediaMetadata
  } {
    const speech = state.getOutput("speech")
    const imported = state.getOutput("transcript_import")
    const acquisition = state.getOutput("acquisition")
    return {
      transcript: speech ?? imported?.transcript,
      knowledge: state.getOutput("knowledge"),
      metadata: acquisition?.metadata
    }
  }

  private async delayRetry(signal: CancellationSignal, attempt: number): Promise<void> {
    const delayMs = this.retryDelaysMs[attempt - 1] ?? 0
    if (delayMs <= 0) {
      return
    }
    await new Promise<void>((resolveDelay, reject) => {
      const timer = setTimeout(resolveDelay, delayMs)
      const onAbort = (): void => {
        clearTimeout(timer)
        reject(new Error("cancelled during retry delay"))
      }
      if (signal.signal.aborted) {
        onAbort()
        return
      }
      signal.signal.addEventListener("abort", onAbort, { once: true })
    })
  }

  private createRuntime(
    request: RunPipelineRequest,
    plan: PipelinePlan,
    stageId: StageId,
    running: RunningStage,
    workspaceDir: string,
    tempDir: string,
    signal: CancellationSignal
  ): StageRuntime<StageId> {
    const jobId = request.jobId

    const reportProgress = (percent: number, message?: string): void => {
      const clamped = Math.max(0, Math.min(100, percent))
      this.options.onProgress?.({ jobId, stageId, percent: clamped, message })
      this.emitStage({ stageId, state: "running", percent: clamped, message, startedAt: Date.now() })
    }

    return {
      jobId,
      stageId,
      engine: plan.engine,
      signal,
      workspaceDir,
      tempDir,
      reportProgress,
      trackArtifact(path: string): void {
        if (!running.artifacts.includes(path)) {
          running.artifacts.push(path)
        }
      },
      untrackArtifact(path: string): void {
        const index = running.artifacts.indexOf(path)
        if (index >= 0) {
          running.artifacts.splice(index, 1)
        }
      }
    }
  }

  private buildInput(
    stageId: StageId,
    state: PipelineRunState,
    source: VideoSource,
    localContext: LocalContext | undefined
  ): unknown {
    switch (stageId) {
      case "acquisition":
        return source
      case "transcript_import":
        return { video: source }
      case "speech": {
        const acquisition = state.getOutput("acquisition")
        if (!acquisition) {
          throw new StageExecutionError({
            stageId,
            code: "internal",
            message: "acquisition output is missing",
            retryable: false
          })
        }
        return { audio: (acquisition as AcquisitionOutput).audio }
      }
      case "knowledge":
      case "cloud_sifter": {
        const transcript = this.requireTranscript(state, stageId)
        return { transcript }
      }
      case "editorial": {
        const transcript = this.requireTranscript(state, stageId)
        const knowledge = state.getOutput("knowledge")
        if (!knowledge) {
          throw new StageExecutionError({
            stageId,
            code: "internal",
            message: "knowledge output is missing for editorial stage",
            retryable: false
          })
        }
        return { transcript, knowledge }
      }
      case "local_sifter": {
        const acquisition = state.getOutput("acquisition")
        const transcript = this.requireTranscript(state, stageId)
        const geminiApiKey = localContext?.apiKeys.geminiApiKey
        if (!acquisition) {
          throw new StageExecutionError({
            stageId,
            code: "internal",
            message: "acquisition output is missing",
            retryable: false
          })
        }
        if (!geminiApiKey) {
          throw new StageExecutionError({
            stageId,
            code: "validation",
            message: "local sifter requires a local gemini api key",
            retryable: false
          })
        }
        return {
          audio: (acquisition as AcquisitionOutput).audio,
          transcript,
          geminiApiKey
        }
      }
      default:
        throw new StageExecutionError({
          stageId,
          code: "internal",
          message: `cannot build input for unknown stage: ${String(stageId)}`,
          retryable: false
        })
    }
  }

  private requireTranscript(state: PipelineRunState, stageId: StageId): unknown {
    const speech = state.getOutput("speech")
    if (speech) {
      return speech
    }
    const imported = state.getOutput("transcript_import")
    if (imported) {
      return (imported as TranscriptImportOutput).transcript
    }
    throw new StageExecutionError({
      stageId,
      code: "internal",
      message: "no transcript is available",
      retryable: false
    })
  }

  private async cleanupStageArtifacts(running: RunningStage, workspaceDir: string): Promise<void> {
    for (const artifact of running.artifacts) {
      if (!isInside(workspaceDir, artifact)) {
        continue
      }
      try {
        await unlink(artifact)
      } catch {
        // best-effort cleanup
      }
    }
  }

  private emitStage(status: StageStatus): void {
    this.options.onStageChange?.(status)
  }

  private async persist(state: PipelineRunState, request: RunPipelineRequest): Promise<void> {
    try {
      await this.store.save({
        version: 1,
        jobId: request.jobId,
        engine: request.engine,
        source: request.source,
        outputs: state.toSnapshotOutputs(),
        updatedAt: Date.now()
      })
    } catch {
      // persistence failures should not abort pipeline progress
    }
  }

  private cancelledResult(
    request: RunPipelineRequest,
    plan: PipelinePlan,
    stageIds: StageId[],
    state: PipelineRunState,
    currentStage: StageId | undefined,
    resumed: boolean
  ): PipelineRunResult {
    return {
      jobId: request.jobId,
      engine: request.engine,
      status: "cancelled",
      plannedStages: stageIds,
      completedStages: stageIds.filter((id) => state.hasOutput(id)),
      currentStage,
      selector: plan.selector,
      resumed
    }
  }
}

function isInside(root: string, target: string): boolean {
  const relativePath = relative(root, resolve(target))
  return relativePath !== "" && !relativePath.startsWith("..") && !isAbsolute(relativePath)
}
