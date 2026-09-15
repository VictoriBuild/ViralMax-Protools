import type { TranscribeProvider } from "@repo/ai"
import type { SpeechInput, SpeechOutput, TranscriptSegment } from "@repo/shared"
import { SpeechInputSchema } from "@repo/shared"
import type { PipelineStage } from "../../contract/stage"
import { StageExecutionError } from "../../contract/errors"
import { validateAgainst } from "../helpers"

export interface SpeechStageOptions {
  provider?: TranscribeProvider
  language?: string
}

export function createSpeechStage(options: SpeechStageOptions = {}): PipelineStage<"speech"> {
  const provider = options.provider
  return {
    id: "speech",
    version: "1.0.0",
    execution: "local",
    description: "Transcribes an audio artifact using a speech recognition provider",
    validate: validateAgainst(SpeechInputSchema),
    async run(runtime, input: SpeechInput) {
      runtime.signal.throwIfAborted()
      if (!provider) {
        throw new StageExecutionError({
          stageId: "speech",
          code: "provider_unavailable",
          message: "no transcription provider is configured",
          retryable: true
        })
      }
      runtime.reportProgress(10, "checking transcription provider")
      const healthy = await provider.isHealthy()
      if (!healthy) {
        throw new StageExecutionError({
          stageId: "speech",
          code: "provider_unavailable",
          message: "transcription provider is unhealthy",
          retryable: true
        })
      }
      runtime.signal.throwIfAborted()
      runtime.reportProgress(20, "transcribing audio")
      const result = await provider.transcribe({
        audioPath: input.audio.path,
        language: options.language
      })
      runtime.signal.throwIfAborted()
      if (result.text.trim().length === 0) {
        throw new StageExecutionError({
          stageId: "speech",
          code: "quality_gate",
          message: "transcription returned empty text",
          retryable: false
        })
      }
      runtime.reportProgress(90, "building transcript segments")
      const segment: TranscriptSegment = {
        startMs: 0,
        endMs: input.audio.durationMs ?? 0,
        text: result.text.trim(),
        confidence: result.confidence
      }
      const output: SpeechOutput = {
        segments: [segment],
        language: options.language,
        source: "speech_recognition",
        fullText: result.text.trim()
      }
      runtime.reportProgress(100, "transcription complete")
      return output
    }
  }
}

export const speechStage = createSpeechStage()
