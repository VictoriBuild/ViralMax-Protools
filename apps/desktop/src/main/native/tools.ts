import { stat } from "node:fs/promises"
import { extname, join, resolve } from "node:path"
import { randomUUID } from "node:crypto"
import type { MediaMetadata } from "@repo/shared"
import { runTool } from "./process"
import { sanitizeToolArgument } from "./sanitize"

export interface ProgressHandler {
  (percent: number, message?: string): void
}

export interface DownloadOptions {
  outputDir: string
  audioOnly: boolean
  signal?: AbortSignal
  timeoutMs?: number
  onProgress?: ProgressHandler
}

export interface DownloadOutcome {
  path: string
  metadata: MediaMetadata
}

export function formatMsToSeconds(durationMs: number | undefined): number | undefined {
  return durationMs === undefined ? undefined : Math.round(durationMs) / 1000
}

function parseNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

export class YtDlpTool {
  constructor(private readonly binaryPath: string) {}

  private sanitizeUrl(url: string): string {
    sanitizeToolArgument(url, "source url")
    return url
  }

  async probe(url: string, signal?: AbortSignal): Promise<MediaMetadata> {
    const result = await runTool(this.binaryPath, {
      args: [
        "--dump-single-json",
        "--no-warnings",
        "--no-playlist",
        "--no-call-home",
        "--skip-download",
        this.sanitizeUrl(url)
      ],
      signal,
      timeoutMs: 60_000
    })
    if (result.code !== 0 || result.stdout.length === 0) {
      throw new Error(this.describeFailure("probe", result.stdout, result.stderr, url))
    }
    let info: unknown
    try {
      info = JSON.parse(result.stdout) as unknown
    } catch {
      throw new Error(`yt-dlp returned invalid metadata for ${url}`)
    }
    if (typeof info !== "object" || info === null) {
      throw new Error(`yt-dlp returned invalid metadata for ${url}`)
    }
    return this.metadataFromProbe(info as Record<string, unknown>)
  }

  async download(url: string, options: DownloadOptions): Promise<DownloadOutcome> {
    const outputDir = resolve(options.outputDir)
    const taskId = randomUUID().slice(0, 8)
    const baseName = `media-${taskId}`
    const { mkdir, readdir } = await import("node:fs/promises")
    await mkdir(outputDir, { recursive: true })
    const before = new Set(await readdir(outputDir))

    const args = [
      "--no-playlist",
      "--no-warnings",
      "--no-call-home",
      "--newline",
      "--progress",
      "--no-mtime",
      "-f",
      options.audioOnly ? "bestaudio/best" : "bestvideo+bestaudio/best"
    ]
    if (!options.audioOnly) {
      args.push("--merge-output-format", "mp4")
    }
    args.push("-o", join(outputDir, `${baseName}.%(ext)s`), this.sanitizeUrl(url))

    const result = await runTool(this.binaryPath, {
      args,
      signal: options.signal,
      timeoutMs: options.timeoutMs ?? 45 * 60 * 1000,
      onStderrLine: (line) => {
        const percent = this.parseDownloadPercent(line)
        if (percent !== null) {
          options.onProgress?.(percent, "downloading media")
        }
      }
    })

    if (result.code !== 0) {
      throw new Error(this.describeFailure("download", result.stdout, result.stderr, url))
    }

    const files = await readdir(outputDir)
    const candidates = files
      .filter((name) => name.startsWith(`${baseName}.`) && !before.has(name))
      .filter((name) => !/\.(part|ytdl)$/i.test(name))

    if (candidates.length === 0) {
      throw new Error(`download finished but no media file was produced for ${url}`)
    }

    const paths = await Promise.all(
      candidates.map(async (name) => ({ name, size: (await stat(join(outputDir, name))).size }))
    )
    paths.sort((a, b) => b.size - a.size)
    const chosen = paths[0]
    if (!chosen) {
      throw new Error(`download finished but no media file was produced for ${url}`)
    }
    const filePath = join(outputDir, chosen.name)
    options.onProgress?.(100, "media downloaded")
    return {
      path: filePath,
      metadata: {
        title: undefined,
        durationMs: undefined,
        format: extname(filePath).slice(1) || undefined,
        sizeBytes: chosen.size
      }
    }
  }

  private metadataFromProbe(info: Record<string, unknown>): MediaMetadata {
    const durationSeconds = parseNumber(info["duration"])
    const width = parseNumber(info["width"])
    const height = parseNumber(info["height"])
    const format =
      typeof info["ext"] === "string" && info["ext"].length > 0 ? (info["ext"] as string) : undefined
    return {
      title: typeof info["title"] === "string" ? (info["title"] as string) : undefined,
      durationMs: durationSeconds === undefined ? undefined : Math.round(durationSeconds * 1000),
      width,
      height,
      format,
      sizeBytes: undefined
    }
  }

  private parseDownloadPercent(line: string): number | null {
    const match = /\[download\]\s+(\d+(?:\.\d+)?)%/.exec(line)
    if (!match) {
      return null
    }
    const value = Number(match[1])
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null
  }

  private describeFailure(action: string, _stdout: string, stderr: string, url: string): string {
    const tail = stderr.trim().split("\n").slice(-3).join(" ")
    return `yt-dlp ${action} failed for ${url}${tail ? `: ${tail}` : ""}`
  }
}

export interface TranscodeOptions {
  inputPath: string
  outputPath?: string
  format?: "wav" | "mp3" | "m4a"
  sampleRate?: number
  channels?: number
  durationMs?: number
  signal?: AbortSignal
  timeoutMs?: number
  onProgress?: ProgressHandler
}

export interface TranscodeOutcome {
  outputPath: string
  durationMs?: number
  sizeBytes: number
}

const DURATION_PATTERN = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/

export class FfmpegTool {
  constructor(private readonly binaryPath: string) {}

  async probeDuration(inputPath: string): Promise<number | undefined> {
    const result = await runTool(this.binaryPath, {
      args: ["-hide_banner", "-i", inputPath],
      timeoutMs: 30_000
    })
    const match = DURATION_PATTERN.exec(result.stderr)
    if (!match) {
      return undefined
    }
    const hours = Number(match[1] ?? "0")
    const minutes = Number(match[2] ?? "0")
    const seconds = Number(match[3] ?? "0")
    return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000)
  }

  async transcodeAudio(options: TranscodeOptions): Promise<TranscodeOutcome> {
    const inputPath = sanitizeToolArgument(options.inputPath, "input path")
    const format = options.format ?? "wav"
    const outputPath = sanitizeToolArgument(
      options.outputPath ?? deriveOutputPath(inputPath, format),
      "output path"
    )
    const durationMs = options.durationMs ?? (await this.probeDuration(inputPath))

    const args = [
      "-y",
      "-hide_banner",
      "-nostats",
      "-progress",
      "pipe:1",
      "-i",
      inputPath,
      "-vn",
      ...codecArgs(format, options.sampleRate, options.channels),
      outputPath
    ]

    const result = await runTool(this.binaryPath, {
      args,
      signal: options.signal,
      timeoutMs: options.timeoutMs ?? 10 * 60 * 1000,
      onStdoutLine: (line) => {
        const elapsedMs = parseOutTime(line)
        if (durationMs && durationMs > 0 && elapsedMs !== null) {
          const percent = Math.max(0, Math.min(100, Math.round((elapsedMs / durationMs) * 100)))
          options.onProgress?.(percent, "encoding audio")
        }
      }
    })

    if (result.code !== 0) {
      const tail = result.stderr.trim().split("\n").slice(-4).join(" ")
      throw new Error(`ffmpeg failed to encode ${inputPath}${tail ? `: ${tail}` : ""}`)
    }

    const fileStats = await stat(outputPath)
    options.onProgress?.(100, "audio ready")
    return { outputPath, durationMs, sizeBytes: fileStats.size }
  }
}

function parseOutTime(line: string): number | null {
  const ms = /^out_time_ms=(\d+)$/.exec(line.trim())
  if (ms) {
    return Number(ms[1]) / 1000
  }
  const seconds = /^out_time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(line.trim())
  if (!seconds) {
    return null
  }
  return (Number(seconds[1]) * 3600 + Number(seconds[2]) * 60 + Number(seconds[3])) * 1000
}

function codecArgs(format: "wav" | "mp3" | "m4a", sampleRate?: number, channels?: number): string[] {
  const args: string[] = []
  if (format === "wav") {
    args.push("-acodec", "pcm_s16le")
    if (sampleRate) {
      args.push("-ar", String(sampleRate))
    }
    if (channels) {
      args.push("-ac", String(channels))
    }
    return args
  }
  if (format === "mp3") {
    args.push("-acodec", "libmp3lame", "-q:a", "2")
    return args
  }
  args.push("-acodec", "aac", "-b:a", "192k")
  return args
}

function deriveOutputPath(inputPath: string, format: string): string {
  const extension = extname(inputPath)
  const directory = inputPath.slice(0, inputPath.length - extension.length)
  return `${directory}.${format}`
}
