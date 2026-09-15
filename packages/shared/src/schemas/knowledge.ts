import { z } from "zod"

export const KnowledgeSummarySchema = z.object({
  title: z.string().min(1),
  text: z.string().min(1)
})
export type KnowledgeSummary = z.infer<typeof KnowledgeSummarySchema>

export const KeyTopicSchema = z.object({
  topic: z.string().min(1),
  mentions: z.number().int().nonnegative().optional()
})
export type KeyTopic = z.infer<typeof KeyTopicSchema>

export const DefinitionSchema = z.object({
  term: z.string().min(1),
  definition: z.string().min(1)
})
export type Definition = z.infer<typeof DefinitionSchema>

export const KnowledgeSchema = z.object({
  summaries: z.array(KnowledgeSummarySchema).default([]),
  topics: z.array(KeyTopicSchema).default([]),
  definitions: z.array(DefinitionSchema).default([])
})
export type Knowledge = z.infer<typeof KnowledgeSchema>
