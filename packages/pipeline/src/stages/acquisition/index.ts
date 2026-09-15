import { stat } from "node:fs/promises"
import { extname } from "node:path"
import type { AcquisitionInput, AcquisitionOutput, AudioArtifact, MediaMetadata, VideoSource } from "@repo/shared"
import { AcquisitionInputSchema } from "@repo/shared"
import type { PipelineStage } from "../../contract/stage"
import { StageExecutionError } from "../../contract/errors"
import { validateAgainst } from "../helpers"

export interface AcquisitionResolver {
  resolve: (source: VideoSource, workspaceDir: string) => Promise<{ path: string; metadata: MediaMetadata }>
}

const MIME_BY_EXTENSION: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg"
}

function mimeFromPath(filePath: string): string | undefined {
  return MIME_BY_EXTENSION[extname(filePath).toLowerCase()]
}

export const defaultAcquisitionResolver: AcquisitionResolver = {
  async resolve(source: VideoSource): Promise<{ path: string; metadata: MediaMetadata }> {
    if (source.kind === "url") {
      throw new StageExecutionError({
        stageId: "acquisition",
        code: "provider_unavailable",
        message: "downloading url sources is not configured in v1",
        retryable: true
      })
    }
    let fileStats
    try {
      fileStats = await stat(source.path)
    } catch {
      throw new StageExecutionError({
        stageId: "acquisition",
        code: "validation",
        message: `source file not found: ${source.path}`,
        retryable: false
      })
    }
    const extension = extname(source.path)
    return {
      path: source.path,
      metadata: {
        format: extension.length > 1 ? extension.slice(1) : undefined,
        sizeBytes: fileStats.size
      }
    }
  }
}

export function createAcquisitionStage(resolver: AcquisitionResolver = defaultAcquisitionResolver): PipelineStage<"acquisition"> {
  return {
    id: "acquisition",
    version: "1.0.0",
    execution: "local",
    description: "Acquires the source media and exposes its audio track",
    validate: validateAgainst(AcquisitionInputSchema),
    async run(runtime, input: AcquisitionInput) {
      runtime.signal.throwIfAborted()
      runtime.reportProgress(10, "resolving source media")
      const resolved = await resolver.resolve(input, runtime.workspaceDir)
      runtime.signal.throwIfAborted()
      runtime.reportProgress(60, "building audio artifact")
      const audio: AudioArtifact = {
        path: resolved.path,
        mimeType: mimeFromPath(resolved.path),
        sizeBytes: resolved.metadata.sizeBytes
      }
      const output: AcquisitionOutput = { source: input, metadata: resolved.metadata, audio }
      runtime.reportProgress(100, "media acquired")
      return output
    }
  }
}

export const acquisitionStage = createAcquisitionStage()
