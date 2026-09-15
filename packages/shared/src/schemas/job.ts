import { z } from "zod"
import { VideoSourceSchema } from "./media"
import { JobResultSchema } from "./result"
import { StageIdSchema } from "./stage"

export const EngineSchema = z.enum(["local", "cloud"])
export type Engine = z.infer<typeof EngineSchema>

export const JobStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled"
])
export type JobStatus = z.infer<typeof JobStatusSchema>

export const MediaSourceSchema = z.object({
  url: z.string().url()
})
export type MediaSource = z.infer<typeof MediaSourceSchema>

export const JobSchema = z.object({
  id: z.string().uuid(),
  source: VideoSourceSchema,
  engine: EngineSchema,
  status: JobStatusSchema,
  stages: z.array(StageIdSchema).default([]),
  currentStage: StageIdSchema.optional(),
  error: z.string().optional(),
  result: JobResultSchema.optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
})
export type Job = z.infer<typeof JobSchema>

export const CreateJobSchema = z.object({
  source: VideoSourceSchema,
  engine: EngineSchema,
  stages: z.array(StageIdSchema).optional()
})
export type CreateJobInput = z.infer<typeof CreateJobSchema>

export const JobIdSchema = z.object({
  jobId: z.string().min(1)
})
export type JobIdInput = z.infer<typeof JobIdSchema>
