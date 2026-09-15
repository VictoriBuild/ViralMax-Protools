import { z } from "zod"
import { ClipsSchema } from "./clip"
import { KnowledgeSchema } from "./knowledge"
import { MediaMetadataSchema } from "./media"
import { TranscriptSchema } from "./transcript"

export const JobResultSchema = z.object({
  clips: ClipsSchema,
  transcript: TranscriptSchema.optional(),
  knowledge: KnowledgeSchema.optional(),
  metadata: MediaMetadataSchema.optional()
})
export type JobResult = z.infer<typeof JobResultSchema>
