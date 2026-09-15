import { spawn } from "node:child_process"
import { accessSync, constants } from "node:fs"
import { AiError, invalidResponse, notConfigured, providerUnavailable } from "../errors"
import type { TranscribeProvider, TranscriptionRequest, TranscriptionResult } from "./transcribe-provider"

export interface WhisperCppProviderOptions {
  binaryPath?: string
  modelPath?: string
  cpuThreads?: number
  maxProcessMs?: number
}

export interface WhisperJsonSegment {
  text: string
  offsets?: { from?: number; to?: number }
  timestamps?: { from?: string; to?: string }
}

export interface WhisperJson {
  transcription?: WhisperJsonSegment[]
  result?: { language?: string }
  language?: string
}

export class WhisperCppProvider implements TranscribeProvider {
  readonly id = "whisper"
  private readonly binaryPath?: string
  private readonly modelPath?: string
  private readonly cpuThreads?: number
  private readonly maxProcessMs: number

  constructor(options: WhisperCppProviderOptions = {}) {
    this.binaryPath = options.binaryPath
    this.modelPath = options.modelPath
    this.cpuThreads = options.cpuThreads
    this.maxProcessMs = options.maxProcessMs ?? 300_000
  }

  async isHealthy(): Promise<boolean> {
    if (!this.binaryPath || !this.modelPath) {
      return false
    }
    try {
      accessSync(this.binaryPath, constants.X_OK)
      accessSync(this.modelPath, constants.R_OK)
      return true
    } catch {
      return false
    }
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
    const startedAt = Date.now()
    if (!this.binaryPath || !this.modelPath) {
      throw notConfigured("whisper", "whisper binary and model path are required")
    }
    if (!(await this.isHealthy())) {
      throw providerUnavailable("whisper", `whisper assets unavailable: ${this.binaryPath}, ${this.modelPath}`)
    }

    const args = buildArgs({
      binaryPath: this.binaryPath,
      modelPath: this.modelPath,
      audioPath: request.audioPath,
      language: request.language,
      cpuThreads: this.cpuThreads
    })

    const { stdout, code, timedOut } = await runProcess(this.binaryPath, args, this.maxProcessMs)
    if (timedOut) {
      throw new AiError({
        providerId: "whisper",
        code: "timeout",
        message: `whisper.cpp process exceeded ${this.maxProcessMs}ms`,
        retryable: true
      })
    }
    if (code !== 0) {
      throw providerUnavailable("whisper", `whisper.cpp exited with code ${code}`)
    }

    const parsed = parseWhisperStdout(stdout)
    const completedAt = Date.now()
    return {
      text: parsed.text,
      provider: this.id,
      language: parsed.language ?? request.language,
      qualityScore: parsed.qualityScore,
      segments: parsed.segments,
      timings: { startedAt, completedAt }
    }
  }
}

interface ArgsInput {
  binaryPath: string
  modelPath: string
  audioPath: string
  language?: string
  cpuThreads?: number
}

function buildArgs(input: ArgsInput): string[] {
  const args = ["-m", input.modelPath, "-f", input.audioPath, "-oj"]
  if (input.language && input.language !== "auto") {
    args.push("-l", input.language)
  }
  if (input.cpuThreads && input.cpuThreads > 0) {
    args.push("-t", String(input.cpuThreads))
  }
  return args
}

interface ProcessResult {
  stdout: string
  stderr: string
  code: number | null
  timedOut: boolean
}

function runProcess(command: string, args: string[], timeoutMs: number): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    let settled = false
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)

    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk
    })
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk
    })
    child.on("error", (error: Error) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      resolve({ stdout, stderr, code: null, timedOut })
      void error
    })
    child.on("close", (code) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      resolve({ stdout, stderr, code, timedOut })
    })
  })
}

interface ParsedTranscript {
  text: string
  segments: TranscriptionResult["segments"]
  language?: string
  qualityScore: number
}

export function parseWhisperStdout(stdout: string): ParsedTranscript {
  const raw = extractWhisperJson(stdout)
  if (raw === undefined) {
    throw invalidResponse("whisper", `whisper output contained no parseable JSON (${stdout.length} bytes)`)
  }
  const segments = raw.transcription
  if (!segments || segments.length === 0) {
    throw invalidResponse("whisper", "whisper transcription output contained no segments")
  }

  const mapped = segments.map((segment) => {
    const startMs = Math.round((segment.offsets?.from ?? 0) * 1000)
    const endMs = Math.round((segment.offsets?.to ?? startMs) * 1000)
    return {
      startMs,
      endMs: Math.max(startMs, endMs),
      text: segment.text.trim()
    }
  })

  const text = mapped
    .map((segment) => segment.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()

  const audioDurationMs =
    mapped.length > 0 ? mapped.reduce((max, segment) => Math.max(max, segment.endMs), 0) : 0
  const qualityScore = computeQualityScore(mapped, audioDurationMs)
  return {
    text,
    segments: mapped,
    language: raw.result?.language ?? raw.language,
    qualityScore
  }
}

export function computeQualityScore(
  segments: { startMs: number; endMs: number; text: string }[],
  audioDurationMs: number
): number {
  if (segments.length === 0 || audioDurationMs <= 0) {
    return 0
  }
  const nonEmpty = segments.filter((segment) => segment.text.trim().length > 0)
  if (nonEmpty.length === 0) {
    return 0
  }
  const speechMs = nonEmpty.reduce((sum, segment) => sum + Math.max(0, segment.endMs - segment.startMs), 0)
  const coverage = Math.min(1, speechMs / audioDurationMs)
  const meaningful = Math.min(1, nonEmpty.length / Math.max(1, segments.length))
  return roundScore(coverage * 0.7 + meaningful * 0.3)
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000
}

export function extractWhisperJson(stdout: string): WhisperJson | undefined {
  if (!stdout.includes("transcription")) {
    return undefined
  }
  const indexes: number[] = []
  for (let i = 0; i < stdout.length; i += 1) {
    if (stdout.charCodeAt(i) === 0x7b) {
      indexes.push(i)
    }
  }
  for (const index of indexes) {
    const candidate = stdout.slice(index)
    try {
      const parsed = JSON.parse(candidate) as unknown
      if (
        parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as WhisperJson).transcription)
      ) {
        return parsed as WhisperJson
      }
    } catch {
      // continue to next candidate
    }
  }
  return undefined
}
