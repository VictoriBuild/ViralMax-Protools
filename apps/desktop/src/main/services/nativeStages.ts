import { extname } from "node:path"
import type { AcquisitionInput, AcquisitionOutput, AudioArtifact } from "@repo/shared"
import { AcquisitionInputSchema } from "@repo/shared"
import type { PipelineStage } from "@repo/pipeline"
import { validateAgainst } from "@repo/pipeline"
import type { MediaToolkit } from "./mediaToolkit"

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

export function createNativeAcquisitionStage(
  toolkit: MediaToolkit,
  onToolProgress?: (jobId: string, kind: "download" | "transcode", percent: number, message?: string) => void
): PipelineStage<"acquisition"> {
  return {
    id: "acquisition",
    version: "1.0.0",
    execution: "local",
    description: "Acquires and prepares source audio for local processing",
    validate: validateAgainst(AcquisitionInputSchema),
    async run(runtime, input: AcquisitionInput) {
      runtime.signal.throwIfAborted()
      runtime.reportProgress(5, "resolving source media")
      const resolved = await toolkit.acquire(input, runtime.workspaceDir, {
        signal: runtime.signal.signal,
        onStage: (kind, percent, message) => {
          onToolProgress?.(runtime.jobId, kind, percent, message)
          runtime.reportProgress(5 + Math.round(percent * 0.9), message ?? "preparing media")
        }
      })
      runtime.signal.throwIfAborted()
      runtime.reportProgress(96, "finalizing audio artifact")
      const audio: AudioArtifact = {
        path: resolved.path,
        mimeType: mimeFromPath(resolved.path),
        durationMs: resolved.metadata.durationMs,
        sizeBytes: resolved.metadata.sizeBytes
      }
      const output: AcquisitionOutput = { source: input, metadata: resolved.metadata, audio }
      runtime.reportProgress(100, "media acquired")
      return output
    }
  }
}
