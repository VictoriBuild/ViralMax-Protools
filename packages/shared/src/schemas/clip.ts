import { z } from "zod"

export const CandidateClipSchema = z
  .object({
    startMs: z.number().nonnegative(),
    endMs: z.number().nonnegative(),
    headline: z.string().min(1),
    rationale: z.string().min(1),
    score: z.number().min(0).max(1).optional()
  })
  .refine((clip) => clip.endMs >= clip.startMs, {
    message: "endMs must be greater than or equal to startMs",
    path: ["endMs"]
  })
export type CandidateClip = z.infer<typeof CandidateClipSchema>

export const ClipsSchema = z.object({
  clips: z.array(CandidateClipSchema).default([])
})
export type Clips = z.infer<typeof ClipsSchema>
