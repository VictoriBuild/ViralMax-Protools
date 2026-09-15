import { z } from "zod"
import { AppSettingsSchema } from "./settings"

export const LocalApiKeysSchema = z.object({
  geminiApiKey: z.string().min(1).nullable().default(null)
})
export type LocalApiKeys = z.infer<typeof LocalApiKeysSchema>

export const CreditBalanceSchema = z.object({
  available: z.number().nonnegative(),
  currency: z.string().min(1),
  updatedAt: z.iso.datetime().optional()
})
export type CreditBalance = z.infer<typeof CreditBalanceSchema>

export const LocalContextSchema = z.object({
  settings: AppSettingsSchema,
  apiKeys: LocalApiKeysSchema
})
export type LocalContext = z.infer<typeof LocalContextSchema>

export const CloudContextSchema = z.object({
  credits: CreditBalanceSchema,
  userId: z.string().min(1)
})
export type CloudContext = z.infer<typeof CloudContextSchema>
