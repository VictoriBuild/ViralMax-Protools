import { z } from "zod"
import { EngineSchema } from "./job"
import { SpeechProviderSchema } from "./native"

export const ToolPathsSchema = z.object({
  ytDlp: z.string().min(1).nullable().default(null),
  ffmpeg: z.string().min(1).nullable().default(null),
  whisperBinary: z.string().min(1).nullable().default(null),
  whisperModel: z.string().min(1).nullable().default(null)
})
export type ToolPaths = z.infer<typeof ToolPathsSchema>

export const DEFAULT_TOOL_PATHS: ToolPaths = {
  ytDlp: null,
  ffmpeg: null,
  whisperBinary: null,
  whisperModel: null
}

export const AppSettingsSchema = z.object({
  defaultEngine: EngineSchema,
  telemetryEnabled: z.boolean().default(true),
  workspacePath: z.string().min(1).nullable(),
  speechProvider: SpeechProviderSchema.default("auto"),
  toolPaths: ToolPathsSchema.default(DEFAULT_TOOL_PATHS)
})
export type AppSettings = z.infer<typeof AppSettingsSchema>

export const AppSettingsPatchSchema = AppSettingsSchema.partial()
export type AppSettingsPatch = z.infer<typeof AppSettingsPatchSchema>
