import { GeminiProvider, ProviderChain, WhisperCppProvider } from "@repo/ai"
import type { TranscribeProvider, TranscriptionRequest, TranscriptionResult } from "@repo/ai"
import type { SpeechProvider, Transcript } from "@repo/shared"
import { TranscriptSchema } from "@repo/shared"

export interface WhisperAssets {
  binaryPath: string
  modelPath: string
}

export interface SpeechServiceOptions {
  whisper: WhisperAssets | null
  geminiApiKey?: string | null
  cpuThreads?: number
  providerPreference?: SpeechProvider
  probeDuration?: (audioPath: string) => Promise<number | undefined>
}

export interface TranscribeAudioRequest {
  audioPath: string
  language?: string
  provider?: SpeechProvider
}

export class SpeechService {
  private readonly whisper?: WhisperCppProvider
  private readonly gemini?: GeminiProvider
  private readonly providerPreference: SpeechProvider
  private readonly probeDuration?: (audioPath: string) => Promise<number | undefined>

  constructor(options: SpeechServiceOptions) {
    if (options.whisper) {
      this.whisper = new WhisperCppProvider({
        binaryPath: options.whisper.binaryPath,
        modelPath: options.whisper.modelPath,
        cpuThreads: options.cpuThreads
      })
    }
    if (options.geminiApiKey) {
      this.gemini = new GeminiProvider({ apiKey: options.geminiApiKey })
    }
    this.providerPreference = options.providerPreference ?? "auto"
    this.probeDuration = options.probeDuration
  }

  async transcribe(request: TranscribeAudioRequest): Promise<Transcript> {
    const providers = this.resolveProviders(request.provider ?? this.providerPreference)
    if (providers.length === 0) {
      throw new Error(this.configurationMessage())
    }
    const chain = new ProviderChain(providers)
    const result = await chain.transcribe({
      audioPath: request.audioPath,
      language: request.language
    })
    return this.toTranscript(request, result.result, result.usedProvider)
  }

  asPipelineProvider(): TranscribeProvider {
    return {
      id: "speech_auto",
      isHealthy: () => Promise.resolve(this.hasProvider(this.providerPreference)),
      transcribe: async (request: TranscriptionRequest): Promise<TranscriptionResult> => {
        const providers = this.resolveProviders(this.providerPreference)
        if (providers.length === 0) {
          throw new Error(this.configurationMessage())
        }
        const chain = new ProviderChain(providers)
        const result = await chain.transcribe(request)
        return result.result
      }
    }
  }

  private hasProvider(preference: SpeechProvider): boolean {
    if (preference === "whisper") {
      return Boolean(this.whisper)
    }
    if (preference === "gemini") {
      return Boolean(this.gemini)
    }
    return this.candidates("auto").length > 0
  }

  private resolveProviders(preference: SpeechProvider): TranscribeProvider[] {
    if (preference === "auto") {
      return this.candidates("auto")
    }
    if (preference === "whisper") {
      if (!this.whisper) {
        throw new Error("whisper.cpp is not configured; set MEDIASUITE_WHISPER_PATH and MEDIASUITE_WHISPER_MODEL")
      }
      return [this.whisper]
    }
    if (!this.gemini) {
      throw new Error("a local Gemini API key is required for remote transcription")
    }
    return [this.gemini]
  }

  private candidates(preference: "auto"): TranscribeProvider[] {
    const providers: TranscribeProvider[] = []
    if (preference === "auto" && this.whisper) {
      providers.push(this.whisper)
    }
    if (this.gemini) {
      providers.push(this.gemini)
    }
    return providers
  }

  private async toTranscript(
    request: TranscribeAudioRequest,
    result: TranscriptionResult,
    usedProvider: string
  ): Promise<Transcript> {
    const text = result.text.trim()
    const segments = result.segments?.length
      ? result.segments.map((segment) => ({
          startMs: Math.max(0, Math.round(segment.startMs)),
          endMs: Math.max(0, Math.round(segment.endMs)),
          text: segment.text.trim(),
          confidence: segment.confidence
        }))
      : undefined

    const transcript: Transcript = {
      segments:
        segments ??
        [
          {
            startMs: 0,
            endMs: usedProvider === "gemini" ? (await this.resolveDuration(request.audioPath)) ?? 0 : 0,
            text,
            confidence: result.confidence
          }
        ],
      language: result.language ?? request.language,
      source: "speech_recognition",
      fullText: text
    }
    return TranscriptSchema.parse(transcript)
  }

  private async resolveDuration(audioPath: string): Promise<number | undefined> {
    if (!this.probeDuration) {
      return undefined
    }
    try {
      return await this.probeDuration(audioPath)
    } catch {
      return undefined
    }
  }

  private configurationMessage(): string {
    const hints: string[] = []
    if (!this.whisper) {
      hints.push("local whisper (set MEDIASUITE_WHISPER_PATH and MEDIASUITE_WHISPER_MODEL)")
    }
    if (!this.gemini) {
      hints.push("a Gemini API key (save one from Settings)")
    }
    return `no speech provider is configured; add ${hints.join(" or ")}`
  }
}
