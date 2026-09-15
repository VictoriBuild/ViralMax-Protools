import { z } from "zod"
import { AudioArtifactSchema, MediaMetadataSchema, VideoSourceSchema } from "./media"

export const MediaProbeRequestSchema = z.object({
  source: VideoSourceSchema
})
export type MediaProbeRequest = z.infer<typeof MediaProbeRequestSchema>

export const MediaDownloadRequestSchema = z.object({
  source: VideoSourceSchema,
  outputDir: z.string().min(1).optional(),
  audioOnly: z.boolean().default(false),
  taskId: z.string().min(1).optional()
})
export type MediaDownloadRequest = z.infer<typeof MediaDownloadRequestSchema>

export const MediaDownloadResultSchema = z.object({
  path: z.string().min(1),
  metadata: MediaMetadataSchema,
  audio: AudioArtifactSchema.optional()
})
export type MediaDownloadResult = z.infer<typeof MediaDownloadResultSchema>

export const MediaCancelRequestSchema = z.object({
  taskId: z.string().min(1)
})
export type MediaCancelRequest = z.infer<typeof MediaCancelRequestSchema>

export const AudioTranscodeRequestSchema = z.object({
  inputPath: z.string().min(1),
  outputPath: z.string().optional(),
  format: z.enum(["wav", "mp3", "m4a"]).default("wav"),
  sampleRate: z.number().int().min(8000).max(48000).optional(),
  channels: z.number().int().min(1).max(2).optional(),
  taskId: z.string().min(1).optional()
})
export type AudioTranscodeRequest = z.infer<typeof AudioTranscodeRequestSchema>

export const AudioTranscodeResultSchema = z.object({
  outputPath: z.string().min(1),
  durationMs: z.number().nonnegative().optional(),
  sizeBytes: z.number().nonnegative().optional()
})
export type AudioTranscodeResult = z.infer<typeof AudioTranscodeResultSchema>

export const SpeechProviderSchema = z.enum(["auto", "whisper", "gemini"])
export type SpeechProvider = z.infer<typeof SpeechProviderSchema>

export const SpeechTranscribeRequestSchema = z.object({
  audioPath: z.string().min(1),
  language: z.string().optional(),
  provider: SpeechProviderSchema.default("auto")
})
export type SpeechTranscribeRequest = z.infer<typeof SpeechTranscribeRequestSchema>

export const KeychainItemSchema = z.object({
  service: z.string().min(1),
  account: z.string().min(1)
})
export type KeychainItem = z.infer<typeof KeychainItemSchema>

export const KeychainGetRequestSchema = KeychainItemSchema
export type KeychainGetRequest = z.infer<typeof KeychainGetRequestSchema>

export const KeychainSetRequestSchema = KeychainItemSchema.extend({
  password: z.string()
})
export type KeychainSetRequest = z.infer<typeof KeychainSetRequestSchema>

export const KeychainDeleteRequestSchema = KeychainItemSchema
export type KeychainDeleteRequest = z.infer<typeof KeychainDeleteRequestSchema>

export const DialogSelectRequestSchema = z.object({
  title: z.string().optional()
})
export type DialogSelectRequest = z.infer<typeof DialogSelectRequestSchema>

export const DialogSelectionResultSchema = z.object({
  path: z.string().nullable()
})
export type DialogSelectionResult = z.infer<typeof DialogSelectionResultSchema>

export const NativeProgressKindSchema = z.enum(["download", "transcode", "probe"])
export type NativeProgressKind = z.infer<typeof NativeProgressKindSchema>

export interface NativeProgress {
  kind: NativeProgressKind
  percent: number
  message?: string
  taskId?: string
}

export interface BinaryStatus {
  ytDlp: string | null
  ffmpeg: string | null
  whisperBinary: string | null
  whisperModel: string | null
}
