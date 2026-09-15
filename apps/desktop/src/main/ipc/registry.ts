import { isAbsolute, join, relative, resolve, sep } from "node:path"
import type { WebContents } from "electron"
import { BrowserWindow, app, ipcMain } from "electron"
import type { IpcChannel } from "@repo/shared"
import {
  AppSettingsPatchSchema,
  AudioTranscodeRequestSchema,
  CreateJobSchema,
  DialogSelectRequestSchema,
  IpcChannels,
  IpcEvents,
  JobIdSchema,
  KeychainDeleteRequestSchema,
  KeychainGetRequestSchema,
  KeychainSetRequestSchema,
  MediaCancelRequestSchema,
  MediaDownloadRequestSchema,
  MediaProbeRequestSchema,
  SpeechTranscribeRequestSchema
} from "@repo/shared"
import type { z } from "zod"
import { resolveBinaries } from "../native/binaries"
import { TaskManager } from "../native/taskManager"
import { MediaToolkit } from "../services/mediaToolkit"
import { DialogService } from "../services/dialogs"
import { JobManager, KEYCHAIN_GEMINI_ACCOUNT, KEYCHAIN_SERVICE, type BroadcastFn } from "../services/jobs"
import { KeychainService } from "../services/keychain"
import { SettingsStore } from "../services/settings"
import { SpeechService } from "../services/speech"
import type { WhisperAssets } from "../services/speech"

type ZodType<T> = z.ZodType<T>
type IpcContext = { sender: WebContents }

function ok(value: unknown) {
  return { ok: true as const, value }
}

function fail(error: string, message: string) {
  return { ok: false as const, error, message }
}

function handle<T>(
  channel: IpcChannel,
  schema: ZodType<T> | null,
  handler: (payload: T, context: IpcContext) => unknown | Promise<unknown>
): void {
  ipcMain.handle(channel, async (event, rawPayload: unknown) => {
    let payload: unknown = rawPayload
    if (schema) {
      const parsed = schema.safeParse(rawPayload)
      if (!parsed.success) {
        return fail("validation_error", "invalid payload")
      }
      payload = parsed.data
    }
    try {
      return ok(await handler(payload as T, { sender: event.sender }))
    } catch (error) {
      return fail("handler_error", error instanceof Error ? error.message : String(error))
    }
  })
}

function parentWindowOf(sender: WebContents): BrowserWindow | null {
  const window = BrowserWindow.fromWebContents(sender)
  return window && !window.isDestroyed() ? window : null
}

function defaultWorkspaceRoot(): string {
  return join(app.getPath("userData"), "workspaces")
}

export async function registerIpcHandlers(): Promise<void> {
  const broadcast: BroadcastFn = (event, payload) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(event, payload)
      }
    }
  }

  const keychain = new KeychainService(join(app.getPath("userData"), "secrets.json"))
  const settings = new SettingsStore(join(app.getPath("userData"), "settings.json"))
  const dialogs = new DialogService()
  const tasks = new TaskManager()

  const effectiveBinaries = async () => resolveBinaries((await settings.get()).toolPaths)
  const createToolkit = async (): Promise<MediaToolkit> => {
    const resolved = await effectiveBinaries()
    return new MediaToolkit({ ytDlp: resolved.ytDlp, ffmpeg: resolved.ffmpeg })
  }
  const createWhisper = async (): Promise<WhisperAssets | null> => {
    const resolved = await effectiveBinaries()
    return resolved.whisperBinary && resolved.whisperModel
      ? { binaryPath: resolved.whisperBinary, modelPath: resolved.whisperModel }
      : null
  }

  const cpuThreads = parsePositiveInt(process.env.MEDIASUITE_WHISPER_THREADS)
  const workspaceRoot = defaultWorkspaceRoot()

  const createSpeech = async (): Promise<SpeechService> => {
    const geminiApiKey = await keychain.get(KEYCHAIN_SERVICE, KEYCHAIN_GEMINI_ACCOUNT)
    const current = await settings.get()
    return new SpeechService({
      whisper: await createWhisper(),
      geminiApiKey,
      cpuThreads,
      providerPreference: current.speechProvider
    })
  }

  const jobManager = new JobManager({
    createToolkit,
    createWhisper,
    cpuThreads,
    keychain,
    settings,
    workspaceRoot,
    jobsDir: join(app.getPath("userData"), "jobs"),
    broadcast
  })

  handle(IpcChannels.settingsGet, null, () => settings.get())
  handle(IpcChannels.settingsSet, AppSettingsPatchSchema, (patch) => settings.patch(patch))
  handle(IpcChannels.jobCreate, CreateJobSchema, (input) => jobManager.create(input))

  handle(IpcChannels.jobCancel, JobIdSchema, async ({ jobId }) => {
    await jobManager.cancel(jobId)
    return undefined
  })

  handle(IpcChannels.jobStatus, JobIdSchema, async ({ jobId }) => {
    const job = await jobManager.status(jobId)
    if (!job) {
      throw new Error(`unknown job: ${jobId}`)
    }
    return job
  })

  handle(IpcChannels.jobSubscribe, JobIdSchema, () => undefined)
  handle(IpcChannels.jobUnsubscribe, JobIdSchema, () => undefined)

  handle(IpcChannels.workspaceResolve, null, (raw) => {
    const relativePath = typeof raw === "object" && raw !== null ? (raw as { relativePath?: unknown }).relativePath : undefined
    if (typeof relativePath !== "string") {
      throw new Error("workspace resolve requires a relativePath string")
    }
    return resolveInside(workspaceRoot, relativePath)
  })
  handle(IpcChannels.billingGetBalance, null, () => ({ balance: 0, currency: "usd" }))
  handle(IpcChannels.billingGetEntitlement, null, () => ({
    plan: "local",
    features: ["local_pipeline", "local_sifter"]
  }))

  handle(IpcChannels.mediaProbe, MediaProbeRequestSchema, async ({ source }) => {
    if (source.kind !== "url") {
      throw new Error("media probe requires a remote URL source")
    }
    const toolkit = await createToolkit()
    return toolkit.probeMetadata(source.url)
  })

  handle(IpcChannels.mediaDownload, MediaDownloadRequestSchema, async ({ source, outputDir, audioOnly, taskId }) => {
    if (source.kind !== "url") {
      throw new Error("media download requires a remote URL source")
    }
    const toolkit = await createToolkit()
    const task = tasks.register(taskId)
    try {
      const destination = outputDir ? resolve(outputDir) : app.getPath("downloads")
      const outcome = await toolkit.downloadStandalone(source.url, {
        outputDir: destination,
        audioOnly,
        signal: task.signal,
        onProgress: (percent, message) => {
          broadcast(IpcEvents.nativeProgress, {
            kind: "download",
            percent,
            message,
            taskId: task.taskId
          })
        }
      })
      return { path: outcome.path, metadata: outcome.metadata }
    } finally {
      tasks.release(task.taskId)
    }
  })

  handle(IpcChannels.mediaCancel, MediaCancelRequestSchema, ({ taskId }) => {
    const cancelled = tasks.cancel(taskId)
    if (!cancelled) {
      throw new Error(`unknown task: ${taskId}`)
    }
    return undefined
  })

  handle(IpcChannels.audioTranscode, AudioTranscodeRequestSchema, async (request) => {
    const toolkit = await createToolkit()
    const task = tasks.register(request.taskId)
    try {
      const outcome = await toolkit.transcodeStandalone({
        inputPath: request.inputPath,
        outputPath: request.outputPath,
        format: request.format,
        sampleRate: request.sampleRate,
        channels: request.channels,
        signal: task.signal,
        onProgress: (percent, message) => {
          broadcast(IpcEvents.nativeProgress, {
            kind: "transcode",
            percent,
            message,
            taskId: task.taskId
          })
        }
      })
      return {
        outputPath: outcome.outputPath,
        durationMs: outcome.durationMs,
        sizeBytes: outcome.sizeBytes
      }
    } finally {
      tasks.release(task.taskId)
    }
  })

  handle(IpcChannels.speechTranscribe, SpeechTranscribeRequestSchema, async ({ audioPath, language, provider }) => {
    const speech = await createSpeech()
    const current = await settings.get()
    const effectiveProvider = provider === "auto" ? current.speechProvider : provider
    return speech.transcribe({ audioPath, language, provider: effectiveProvider })
  })

  handle(IpcChannels.keychainGet, KeychainGetRequestSchema, async ({ service, account }) => ({
    password: await keychain.get(service, account)
  }))

  handle(IpcChannels.keychainSet, KeychainSetRequestSchema, async ({ service, account, password }) => {
    await keychain.set(service, account, password)
    return undefined
  })

  handle(IpcChannels.keychainDelete, KeychainDeleteRequestSchema, async ({ service, account }) => {
    await keychain.delete(service, account)
    return undefined
  })

  handle(IpcChannels.dialogSelectMedia, DialogSelectRequestSchema, async ({ title }, context) => {
    const path = await dialogs.selectMedia(parentWindowOf(context.sender), title)
    return { path }
  })

  handle(IpcChannels.dialogSelectDirectory, DialogSelectRequestSchema, async ({ title }, context) => {
    const path = await dialogs.selectDirectory(parentWindowOf(context.sender), title)
    return { path }
  })

  handle(IpcChannels.toolsStatus, null, async () => {
    const resolved = await effectiveBinaries()
    return {
      ytDlp: resolved.ytDlp,
      ffmpeg: resolved.ffmpeg,
      whisperBinary: resolved.whisperBinary,
      whisperModel: resolved.whisperModel
    }
  })
}

function resolveInside(base: string, relativePath: string): string {
  const basePath = resolve(base)
  const candidate = isAbsolute(relativePath) ? resolve(relativePath) : resolve(basePath, relativePath)
  const relativeToBase = relative(basePath, candidate)
  if (relativeToBase === ".." || relativeToBase.startsWith(`..${sep}`) || isAbsolute(relativeToBase)) {
    throw new Error("workspace path escapes the workspace root")
  }
  return candidate
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) {
    return undefined
  }
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}
