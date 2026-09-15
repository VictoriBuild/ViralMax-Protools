import type { LocalSifterClient, DefaultStageOverrides, StageRegistry } from "@repo/pipeline"
import { createDefaultRegistry, createLocalSifterStage, createSpeechStage } from "@repo/pipeline"
import type { TranscribeProvider } from "@repo/ai"
import type { MediaToolkit } from "./mediaToolkit"
import { createNativeAcquisitionStage } from "./nativeStages"

export interface RuntimeRegistryOptions {
  toolkit: MediaToolkit
  speechProvider: TranscribeProvider
  localSifter?: LocalSifterClient
  onToolProgress?: (jobId: string, kind: "download" | "transcode", percent: number, message?: string) => void
}

export function buildRuntimeRegistry(options: RuntimeRegistryOptions): StageRegistry {
  const overrides: DefaultStageOverrides = {
    acquisition: createNativeAcquisitionStage(options.toolkit, options.onToolProgress),
    speech: createSpeechStage({ provider: options.speechProvider })
  }
  if (options.localSifter) {
    overrides.localSifter = createLocalSifterStage({ client: options.localSifter })
  }
  return createDefaultRegistry(overrides)
}
