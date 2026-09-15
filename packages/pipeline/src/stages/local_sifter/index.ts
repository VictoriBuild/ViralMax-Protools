import type { Clips, LocalSifterInput, Transcript } from "@repo/shared"
import { ClipsSchema, LocalSifterInputSchema } from "@repo/shared"
import type { PipelineStage } from "../../contract/stage"
import { StageExecutionError } from "../../contract/errors"
import { validateAgainst } from "../helpers"

export interface LocalSifterClient {
  sift: (request: { audioPath: string; transcript: Transcript; geminiApiKey: string }) => Promise<Clips>
}

export interface LocalSifterStageOptions {
  client?: LocalSifterClient
}

export function createLocalSifterStage(options: LocalSifterStageOptions = {}): PipelineStage<"local_sifter"> {
  const client = options.client
  return {
    id: "local_sifter",
    version: "1.0.0",
    execution: "local",
    description: "Sifts candidate clips locally using a Gemini-backed client",
    validate: validateAgainst(LocalSifterInputSchema),
    async run(runtime, input: LocalSifterInput) {
      runtime.signal.throwIfAborted()
      if (!client) {
        throw new StageExecutionError({
          stageId: "local_sifter",
          code: "provider_unavailable",
          message: "no local gemini sifter client is configured",
          retryable: true
        })
      }
      runtime.reportProgress(30, "sifting candidates with gemini")
      const result = await client.sift({
        audioPath: input.audio.path,
        transcript: input.transcript,
        geminiApiKey: input.geminiApiKey
      })
      runtime.signal.throwIfAborted()
      const parsed = ClipsSchema.parse(result)
      runtime.reportProgress(100, "sifting complete")
      return parsed
    }
  }
}

export const localSifterStage = createLocalSifterStage()
