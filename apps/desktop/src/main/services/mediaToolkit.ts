import { mkdir, stat } from "node:fs/promises"
import { dirname, extname, join, resolve } from "node:path"
import type { MediaMetadata, VideoSource } from "@repo/shared"
import { FfmpegTool, YtDlpTool, type ProgressHandler } from "../native/tools"

export interface AcquireOptions {
  signal?: AbortSignal
  onProgress?: ProgressHandler
  onStage?: (kind: "download" | "transcode", percent: number, message?: string) => void
}

export interface MediaAcquireResult {
  path: string
  metadata: MediaMetadata
  originalPath?: string
}

export interface MediaAssets {
  ytDlp: string | null
  ffmpeg: string | null
}

function emitProgress(
  options: AcquireOptions,
  kind: "download" | "transcode",
  percent: number,
  message?: string
): void {
  options.onStage?.(kind, percent, message)
  options.onProgress?.(percent, message)
}

export class MediaToolkit {
  private readonly ytDlp: YtDlpTool | null
  private readonly ffmpeg: FfmpegTool | null

  constructor(private readonly assets: MediaAssets) {
    this.ytDlp = assets.ytDlp ? new YtDlpTool(assets.ytDlp) : null
    this.ffmpeg = assets.ffmpeg ? new FfmpegTool(assets.ffmpeg) : null
  }

  async acquire(source: VideoSource, workspaceDir: string, options: AcquireOptions = {}): Promise<MediaAcquireResult> {
    if (source.kind === "local") {
      return this.acquireLocal(source.path, workspaceDir, options)
    }
    return this.acquireRemote(source.url, workspaceDir, options)
  }

  async probeMetadata(url: string, signal?: AbortSignal): Promise<MediaMetadata> {
    if (!this.ytDlp) {
      throw new Error("yt-dlp is not available; cannot probe remote media")
    }
    return this.ytDlp.probe(url, signal)
  }

  async downloadStandalone(
    url: string,
    options: { outputDir: string; audioOnly: boolean; signal?: AbortSignal; onProgress?: ProgressHandler }
  ): Promise<{ path: string; metadata: MediaMetadata }> {
    if (!this.ytDlp) {
      throw new Error("yt-dlp is not available; cannot download remote media")
    }
    return this.ytDlp.download(url, {
      outputDir: options.outputDir,
      audioOnly: options.audioOnly,
      signal: options.signal,
      onProgress: options.onProgress,
      timeoutMs: 45 * 60 * 1000
    })
  }

  async transcodeStandalone(
    request: {
      inputPath: string
      outputPath?: string
      format?: "wav" | "mp3" | "m4a"
      sampleRate?: number
      channels?: number
      signal?: AbortSignal
      onProgress?: ProgressHandler
    }
  ): Promise<{ outputPath: string; durationMs?: number; sizeBytes: number }> {
    if (!this.ffmpeg) {
      throw new Error("ffmpeg is not available; cannot transcode audio")
    }
    if (request.outputPath) {
      await mkdir(dirname(request.outputPath), { recursive: true })
    }
    return this.ffmpeg.transcodeAudio({
      inputPath: request.inputPath,
      outputPath: request.outputPath,
      format: request.format ?? "wav",
      sampleRate: request.sampleRate,
      channels: request.channels,
      signal: request.signal,
      onProgress: request.onProgress
    })
  }

  private async acquireLocal(
    filePath: string,
    workspaceDir: string,
    options: AcquireOptions
  ): Promise<MediaAcquireResult> {
    const resolved = resolve(filePath)
    const extension = extname(resolved).toLowerCase()
    const fileStats = await stat(resolved)
    const metadata: MediaMetadata = {
      durationMs: this.ffmpeg ? await this.ffmpeg.probeDuration(resolved) : undefined,
      format: extension.length > 1 ? extension.slice(1) : undefined,
      sizeBytes: fileStats.size
    }

    if (extension === ".wav" || !this.ffmpeg) {
      return { path: resolved, metadata }
    }

    await mkdir(workspaceDir, { recursive: true })
    const outputPath = join(resolve(workspaceDir), "audio.wav")
    const transcoded = await this.ffmpeg.transcodeAudio({
      inputPath: resolved,
      outputPath,
      format: "wav",
      sampleRate: 16000,
      channels: 1,
      durationMs: metadata.durationMs,
      signal: options.signal,
      onProgress: (percent, message) => emitProgress(options, "transcode", percent, message)
    })
    return {
      path: outputPath,
      metadata: { ...metadata, sizeBytes: transcoded.sizeBytes, format: "wav" },
      originalPath: resolved
    }
  }

  private async acquireRemote(
    url: string,
    workspaceDir: string,
    options: AcquireOptions
  ): Promise<MediaAcquireResult> {
    if (!this.ytDlp) {
      throw new Error("yt-dlp is not available; cannot download remote media")
    }
    const probeMetadata = await this.ytDlp.probe(url, options.signal)

    const downloadDir = join(resolve(workspaceDir), "downloads")
    await mkdir(downloadDir, { recursive: true })
    const downloaded = await this.ytDlp.download(url, {
      outputDir: downloadDir,
      audioOnly: true,
      signal: options.signal,
      timeoutMs: 45 * 60 * 1000,
      onProgress: (percent, message) => emitProgress(options, "download", percent, message)
    })

    if (!this.ffmpeg) {
      return { path: downloaded.path, metadata: downloaded.metadata, originalPath: downloaded.path }
    }

    const outputPath = join(resolve(workspaceDir), "audio.wav")
    const transcoded = await this.ffmpeg.transcodeAudio({
      inputPath: downloaded.path,
      outputPath,
      format: "wav",
      sampleRate: 16000,
      channels: 1,
      durationMs: probeMetadata.durationMs,
      signal: options.signal,
      onProgress: (percent, message) => emitProgress(options, "transcode", percent, message)
    })

    return {
      path: outputPath,
      metadata: {
        ...probeMetadata,
        sizeBytes: transcoded.sizeBytes,
        format: "wav",
        durationMs: transcoded.durationMs ?? probeMetadata.durationMs
      },
      originalPath: downloaded.path
    }
  }
}
