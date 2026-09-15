import { randomUUID } from "node:crypto"
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import type { AppSettings, CreateJobInput, IpcEvent, IpcEventPayload, Job, LocalContext } from "@repo/shared"
import { IpcEvents } from "@repo/shared"
import type { LocalSifterClient, PipelinePlan } from "@repo/pipeline"
import { PipelineRunner, buildPlan, orderedStages } from "@repo/pipeline"
import { GeminiProvider } from "@repo/ai"
import type { MediaToolkit } from "./mediaToolkit"
import type { KeychainService } from "./keychain"
import type { SettingsStore } from "./settings"
import type { WhisperAssets } from "./speech"
import { SpeechService } from "./speech"
import { buildRuntimeRegistry } from "./pipelineRuntime"

export const KEYCHAIN_SERVICE = "com.mediasuite.desktop"
export const KEYCHAIN_GEMINI_ACCOUNT = "gemini"

export type BroadcastFn = <E extends IpcEvent>(event: E, payload: IpcEventPayload<E>) => void

export interface JobManagerOptions {
  createToolkit: () => Promise<MediaToolkit>
  createWhisper: () => Promise<WhisperAssets | null>
  cpuThreads?: number
  keychain: KeychainService
  settings: SettingsStore
  workspaceRoot: string
  jobsDir: string
  broadcast: BroadcastFn
}

export class JobManager {
  private readonly running = new Map<string, { controller: AbortController }>()
  private readonly memory = new Map<string, Job>()

  constructor(private readonly options: JobManagerOptions) {
    void this.recoverStaleJobs()
  }

  async create(input: CreateJobInput): Promise<Job> {
    const id = randomUUID()
    const createdAt = new Date().toISOString()
    const settings = await this.options.settings.get()
    const geminiKey = await this.readGeminiKey()
    const localContext = this.localContext(settings, geminiKey)
    const plan = buildPlan({ engine: input.engine, source: input.source, localContext })
    const job: Job = {
      id,
      source: input.source,
      engine: input.engine,
      status: "queued",
      stages: orderedStages(plan),
      createdAt,
      updatedAt: createdAt
    }
    this.memory.set(id, job)
    await this.persist(job)
    this.broadcastStatus(job)

    const controller = new AbortController()
    this.running.set(id, { controller })
    void this.execute(id, plan, settings, geminiKey, controller.signal)
    return job
  }

  async cancel(jobId: string): Promise<boolean> {
    const running = this.running.get(jobId)
    const current = this.memory.get(jobId)
    if (running) {
      running.controller.abort(new Error("job cancelled by user"))
    }
    if (current && (current.status === "queued" || current.status === "running")) {
      await this.updateById(jobId, { status: "cancelled" })
    }
    return Boolean(current)
  }

  async status(jobId: string): Promise<Job | undefined> {
    const cached = this.memory.get(jobId)
    if (cached) {
      return cached
    }
    return this.loadHistory(jobId)
  }

  private async execute(
    jobId: string,
    plan: PipelinePlan,
    settings: AppSettings,
    geminiKey: string | null,
    signal: AbortSignal
  ): Promise<void> {
    await this.updateById(jobId, { status: "running", currentStage: plan.selector })
    const toolkit = await this.options.createToolkit()
    const whisper = await this.options.createWhisper()
    const speechService = new SpeechService({
      whisper,
      geminiApiKey: geminiKey,
      cpuThreads: this.options.cpuThreads,
      providerPreference: settings.speechProvider
    })
    const localSifter = geminiKey ? this.createSifterClient(geminiKey) : undefined
    const registry = buildRuntimeRegistry({
      toolkit,
      speechProvider: speechService.asPipelineProvider(),
      localSifter,
      onToolProgress: (id, kind, percent, message) => {
        this.options.broadcast(IpcEvents.nativeProgress, { kind, percent, message, taskId: id })
      }
    })

    const runner = new PipelineRunner(registry, {
      retryDelaysMs: [150, 700],
      onProgress: (progress) => {
        this.options.broadcast(IpcEvents.pipelineProgress, {
          jobId,
          stageId: progress.stageId,
          percent: progress.percent,
          message: progress.message
        })
      }
    })

    try {
      const result = await runner.run({
        jobId,
        source: plan.source,
        engine: plan.engine,
        plan,
        localContext: this.localContext(settings, geminiKey),
        workspaceDir: join(resolve(this.options.workspaceRoot), jobId),
        signal
      })
      await this.updateById(jobId, {
        status: result.status,
        currentStage: result.currentStage,
        error: result.error?.message,
        result: result.clips
          ? {
              clips: result.clips,
              transcript: result.transcript,
              knowledge: result.knowledge,
              metadata: result.metadata
            }
          : undefined
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.updateById(jobId, { status: "failed", error: message })
    } finally {
      this.running.delete(jobId)
    }
  }

  private createSifterClient(geminiApiKey: string): LocalSifterClient {
    const provider = new GeminiProvider({ apiKey: geminiApiKey })
    return {
      sift: async (request) =>
        provider.siftViralClips({
          transcript: request.transcript,
          candidates: [],
          reasoning:
            "Identify 3-5 distinct, high-impact moments directly from this transcript. Anchor every timestamp to a real segment boundary and keep clips 15-120s."
        })
    }
  }

  private localContext(settings: AppSettings, geminiApiKey: string | null): LocalContext {
    return { settings, apiKeys: { geminiApiKey } }
  }

  private async readGeminiKey(): Promise<string | null> {
    try {
      return await this.options.keychain.get(KEYCHAIN_SERVICE, KEYCHAIN_GEMINI_ACCOUNT)
    } catch {
      return null
    }
  }

  private async updateById(jobId: string, patch: Partial<Job>): Promise<void> {
    const current = this.memory.get(jobId)
    if (!current) {
      return
    }
    const next: Job = { ...current, ...patch, updatedAt: new Date().toISOString() }
    this.memory.set(jobId, next)
    await this.persist(next)
    this.broadcastStatus(next)
  }

  private broadcastStatus(job: Job): void {
    this.options.broadcast(IpcEvents.jobStatusChanged, { jobId: job.id, status: job })
  }

  private async persist(job: Job): Promise<void> {
    try {
      await mkdir(this.options.jobsDir, { recursive: true })
      await writeFile(join(this.options.jobsDir, `${job.id}.json`), JSON.stringify(job, null, 2), "utf8")
    } catch {
      // history persistence is best-effort
    }
  }

  private async loadHistory(jobId: string): Promise<Job | undefined> {
    try {
      const raw = await readFile(join(this.options.jobsDir, `${jobId}.json`), "utf8")
      const parsed = JSON.parse(raw) as unknown
      if (parsed && typeof parsed === "object" && "id" in parsed) {
        return parsed as Job
      }
    } catch {
      // missing history falls through
    }
    return undefined
  }

  private async recoverStaleJobs(): Promise<void> {
    let files: string[]
    try {
      files = await readdir(this.options.jobsDir)
    } catch {
      return
    }
    for (const file of files) {
      if (!file.endsWith(".json")) {
        continue
      }
      try {
        const raw = await readFile(join(this.options.jobsDir, file), "utf8")
        const parsed = JSON.parse(raw) as Partial<Job>
        if (parsed.id && parsed.status !== undefined && (parsed.status === "queued" || parsed.status === "running")) {
          const stale: Job = {
            id: parsed.id,
            source: parsed.source ?? { kind: "local", path: "" },
            engine: parsed.engine ?? "local",
            status: "failed",
            stages: parsed.stages ?? [],
            currentStage: parsed.currentStage,
            error: "application exited while the job was running",
            createdAt: parsed.createdAt ?? new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
          await writeFile(join(this.options.jobsDir, file), JSON.stringify(stale, null, 2), "utf8")
        }
      } catch {
        // corrupt history file is skipped
      }
    }
  }
}
