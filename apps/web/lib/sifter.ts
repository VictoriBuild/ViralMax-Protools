import { GeminiProvider } from "@repo/ai"
import type { Clips, Transcript } from "@repo/shared"
import { serverEnvOrThrow } from "./server-env"

export interface CloudSifterOptions {
  apiKey?: string
  model?: string
  fetchFn?: typeof fetch
  timeoutMs?: number
}

export async function siftTranscript(
  transcript: Transcript,
  options: CloudSifterOptions = {}
): Promise<Clips> {
  const provider = new GeminiProvider({
    apiKey: options.apiKey ?? serverEnvOrThrow("GEMINI_API_KEY"),
    model: options.model ?? process.env.GEMINI_MODEL,
    fetchFn: options.fetchFn,
    timeoutMs: options.timeoutMs
  })
  const knowledge = await provider.extractKnowledge({ transcript })
  const editorial = await provider.generateEditorialClips({ transcript, knowledge })
  return provider.siftViralClips({
    transcript,
    candidates: editorial.clips,
    reasoning: "server-generated editorial candidates"
  })
}

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY)
}
