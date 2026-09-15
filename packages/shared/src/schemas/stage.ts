import { z } from "zod"
import { AudioArtifactSchema, MediaMetadataSchema, VideoSourceSchema } from "./media"
import { TranscriptSchema } from "./transcript"
import { KnowledgeSchema } from "./knowledge"
import { ClipsSchema } from "./clip"

export const StageIdSchema = z.enum([
  "acquisition",
  "transcript_import",
  "speech",
  "knowledge",
  "editorial",
  "local_sifter",
  "cloud_sifter"
])
export type StageId = z.infer<typeof StageIdSchema>

export const AcquisitionInputSchema = VideoSourceSchema
export type AcquisitionInput = z.infer<typeof AcquisitionInputSchema>

export const AcquisitionOutputSchema = z.object({
  source: VideoSourceSchema,
  metadata: MediaMetadataSchema,
  audio: AudioArtifactSchema
})
export type AcquisitionOutput = z.infer<typeof AcquisitionOutputSchema>

export const TranscriptImportInputSchema = z.object({
  video: VideoSourceSchema
})
export type TranscriptImportInput = z.infer<typeof TranscriptImportInputSchema>

export const TranscriptImportOutputSchema = z.object({
  transcript: TranscriptSchema,
  captionsAvailable: z.boolean()
})
export type TranscriptImportOutput = z.infer<typeof TranscriptImportOutputSchema>

export const SpeechInputSchema = z.object({
  audio: AudioArtifactSchema
})
export type SpeechInput = z.infer<typeof SpeechInputSchema>

export const SpeechOutputSchema = TranscriptSchema
export type SpeechOutput = z.infer<typeof SpeechOutputSchema>

export const KnowledgeInputSchema = z.object({
  transcript: TranscriptSchema
})
export type KnowledgeInput = z.infer<typeof KnowledgeInputSchema>

export const KnowledgeOutputSchema = KnowledgeSchema
export type KnowledgeOutput = z.infer<typeof KnowledgeOutputSchema>

export const EditorialInputSchema = z.object({
  transcript: TranscriptSchema,
  knowledge: KnowledgeSchema
})
export type EditorialInput = z.infer<typeof EditorialInputSchema>

export const EditorialOutputSchema = ClipsSchema
export type EditorialOutput = z.infer<typeof EditorialOutputSchema>

export const LocalSifterInputSchema = z.object({
  audio: AudioArtifactSchema,
  transcript: TranscriptSchema,
  geminiApiKey: z.string().min(1)
})
export type LocalSifterInput = z.infer<typeof LocalSifterInputSchema>

export const LocalSifterOutputSchema = ClipsSchema
export type LocalSifterOutput = z.infer<typeof LocalSifterOutputSchema>

export const CloudSifterInputSchema = z.object({
  transcript: TranscriptSchema
})
export type CloudSifterInput = z.infer<typeof CloudSifterInputSchema>

export const CloudSifterOutputSchema = ClipsSchema
export type CloudSifterOutput = z.infer<typeof CloudSifterOutputSchema>

export const StageInputSchemas = {
  acquisition: AcquisitionInputSchema,
  transcript_import: TranscriptImportInputSchema,
  speech: SpeechInputSchema,
  knowledge: KnowledgeInputSchema,
  editorial: EditorialInputSchema,
  local_sifter: LocalSifterInputSchema,
  cloud_sifter: CloudSifterInputSchema
} as const satisfies Record<StageId, z.ZodTypeAny>
export type StageInputOf<ID extends StageId> = z.infer<(typeof StageInputSchemas)[ID]>

export const StageOutputSchemas = {
  acquisition: AcquisitionOutputSchema,
  transcript_import: TranscriptImportOutputSchema,
  speech: SpeechOutputSchema,
  knowledge: KnowledgeOutputSchema,
  editorial: EditorialOutputSchema,
  local_sifter: LocalSifterOutputSchema,
  cloud_sifter: CloudSifterOutputSchema
} as const satisfies Record<StageId, z.ZodTypeAny>
export type StageOutputOf<ID extends StageId> = z.infer<(typeof StageOutputSchemas)[ID]>
