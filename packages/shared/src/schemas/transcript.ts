import { z } from "zod"

export const TranscriptSegmentSchema = z
  .object({
    startMs: z.number().nonnegative(),
    endMs: z.number().nonnegative(),
    text: z.string().min(1),
    confidence: z.number().min(0).max(1).optional()
  })
  .refine((segment) => segment.endMs >= segment.startMs, {
    message: "endMs must be greater than or equal to startMs",
    path: ["endMs"]
  })
export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>

export const TranscriptSourceSchema = z.enum(["platform_captions", "speech_recognition"])
export type TranscriptSource = z.infer<typeof TranscriptSourceSchema>

export const TranscriptSchema = z.object({
  segments: z.array(TranscriptSegmentSchema).min(1),
  language: z.string().optional(),
  source: TranscriptSourceSchema.optional(),
  fullText: z.string().min(1).optional()
})
export type Transcript = z.infer<typeof TranscriptSchema>
