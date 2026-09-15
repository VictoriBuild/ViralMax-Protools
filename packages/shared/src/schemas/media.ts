import { z } from "zod"

export const VideoSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("url"), url: z.string().url() }),
  z.object({ kind: z.literal("local"), path: z.string().min(1) })
])
export type VideoSource = z.infer<typeof VideoSourceSchema>

export const MediaMetadataSchema = z.object({
  title: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  format: z.string().optional(),
  sizeBytes: z.number().nonnegative().optional()
})
export type MediaMetadata = z.infer<typeof MediaMetadataSchema>

export const AudioArtifactSchema = z.object({
  path: z.string().min(1),
  mimeType: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
  sizeBytes: z.number().nonnegative().optional()
})
export type AudioArtifact = z.infer<typeof AudioArtifactSchema>
