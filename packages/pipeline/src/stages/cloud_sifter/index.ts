import type { Clips, CloudSifterInput, Transcript } from "@repo/shared"
import { ClipsSchema, CloudSifterInputSchema } from "@repo/shared"
import type { PipelineStage } from "../../contract/stage"
import { StageExecutionError } from "../../contract/errors"
import { validateAgainst } from "../helpers"

export interface CloudSifterClient {
  sift: (request: { transcript: Transcript }) => Promise<Clips>
}

export interface CloudSifterStageOptions {
  client?: CloudSifterClient
}

export function createCloudSifterStage(options: CloudSifterStageOptions = {}): PipelineStage<"cloud_sifter"> {
  const client = options.client
  return {
    id: "cloud_sifter",
    version: "1.0.0",
    execution: "cloud",
    description: "Sifts candidate clips on the cloud gateway",
    validate: validateAgainst(CloudSifterInputSchema),
    async run(runtime, input: CloudSifterInput) {
      runtime.signal.throwIfAborted()
      if (!client) {
        throw new StageExecutionError({
          stageId: "cloud_sifter",
          code: "provider_unavailable",
          message: "no cloud sifter client is configured",
          retryable: true
        })
      }
      runtime.reportProgress(30, "sending transcript to the cloud sifter")
      const result = await client.sift({ transcript: input.transcript })
      runtime.signal.throwIfAborted()
      const parsed = ClipsSchema.parse(result)
      runtime.reportProgress(100, "sifting complete")
      return parsed
    }
  }
}

export const cloudSifterStage = createCloudSifterStage()
