import type { StageId } from "@repo/shared"
import type { PipelineStage } from "./contract/stage"
import { StageRegistry } from "./engine/registry"
import {
  acquisitionStage,
  cloudSifterStage,
  editorialStage,
  knowledgeStage,
  localSifterStage,
  speechStage,
  transcriptImportStage
} from "./stages"

export * from "./contract"
export * from "./engine"
export * from "./stages"

export interface DefaultStageOverrides {
  acquisition?: PipelineStage<"acquisition">
  transcriptImport?: PipelineStage<"transcript_import">
  speech?: PipelineStage<"speech">
  knowledge?: PipelineStage<"knowledge">
  editorial?: PipelineStage<"editorial">
  localSifter?: PipelineStage<"local_sifter">
  cloudSifter?: PipelineStage<"cloud_sifter">
}

export const defaultStageIds: StageId[] = [
  "acquisition",
  "transcript_import",
  "speech",
  "knowledge",
  "editorial",
  "local_sifter",
  "cloud_sifter"
]

export function createDefaultRegistry(overrides: DefaultStageOverrides = {}): StageRegistry {
  return new StageRegistry()
    .register(overrides.acquisition ?? acquisitionStage)
    .register(overrides.transcriptImport ?? transcriptImportStage)
    .register(overrides.speech ?? speechStage)
    .register(overrides.knowledge ?? knowledgeStage)
    .register(overrides.editorial ?? editorialStage)
    .register(overrides.localSifter ?? localSifterStage)
    .register(overrides.cloudSifter ?? cloudSifterStage)
}
