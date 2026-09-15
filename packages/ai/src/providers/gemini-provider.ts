import { basename, extname } from "node:path"
import type { CandidateClip, Clips, Knowledge, Transcript } from "@repo/shared"
import { ClipsSchema, KnowledgeSchema } from "@repo/shared"
import type { z } from "zod"
import { GeminiClient, classifyGeminiError } from "./gemini-client"
import { zodToGeminiSchema } from "../prompting/gemini-schema"
import { parseStructured, type BuiltPrompt } from "../prompting/prompt-builder"
import {
  buildEditorialPrompt,
  buildKnowledgePrompt,
  buildSifterPrompt
} from "../prompting/tasks"
import type { TranscribeProvider, TranscriptionRequest, TranscriptionResult } from "./transcribe-provider"
import { notConfigured } from "../errors"

export interface GeminiProviderOptions {
  apiKey?: string
  endpoint?: string
  model?: string
  fetchFn?: typeof fetch
  timeoutMs?: number
}

export interface ExtractKnowledgeRequest {
  transcript: Transcript
}

export interface EditorialClipsRequest {
  transcript: Transcript
  knowledge: Knowledge
}

export interface SiftClipsRequest {
  transcript: Transcript
  candidates: CandidateClip[]
  reasoning?: string
}

export interface AiMediaCapabilities {
  extractKnowledge(request: ExtractKnowledgeRequest): Promise<Knowledge>
  generateEditorialClips(request: EditorialClipsRequest): Promise<Clips>
  siftViralClips(request: SiftClipsRequest): Promise<Clips>
}

export type GeminiMediaProvider = TranscribeProvider & AiMediaCapabilities

const TRANSCRIBE_INSTRUCTION =
  "Transcribe the following audio verbatim. Preserve speaker turns, sentence boundaries, numbers, and proper nouns. " +
  "Return only the plain transcript text, with no commentary."

export class GeminiProvider implements GeminiMediaProvider {
  readonly id = "gemini"
  private readonly client: GeminiClient

  constructor(private readonly options: GeminiProviderOptions) {
    this.client = new GeminiClient({
      apiKey: options.apiKey,
      endpoint: options.endpoint,
      model: options.model,
      fetchFn: options.fetchFn,
      timeoutMs: options.timeoutMs
    })
  }

  async isHealthy(): Promise<boolean> {
    return this.client.isConfigured()
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
    const startedAt = Date.now()
    if (!this.client.isConfigured()) {
      throw notConfigured("gemini", "gemini api key is not configured")
    }
    try {
      const mimeType = guessMimeType(request.audioPath)
      const uploaded = await this.client.uploadFile(
        request.audioPath,
        mimeType,
        basename(request.audioPath)
      )
      const text = await this.client.generateJson({
        parts: [
          { fileData: { mimeType: uploaded.mimeType, fileUri: uploaded.uri } },
          { text: TRANSCRIBE_INSTRUCTION }
        ]
      })
      return {
        text: text.trim(),
        provider: this.id,
        qualityScore: text.trim().length > 0 ? 0.9 : 0,
        language: request.language,
        timings: { startedAt, completedAt: Date.now() }
      }
    } catch (error) {
      throw classifyGeminiError(error)
    }
  }

  async extractKnowledge(request: ExtractKnowledgeRequest): Promise<Knowledge> {
    const prompt = buildKnowledgePrompt(request.transcript)
    return this.runStructured(prompt, KnowledgeSchema)
  }

  async generateEditorialClips(request: EditorialClipsRequest): Promise<Clips> {
    const prompt = buildEditorialPrompt(request.transcript, request.knowledge)
    return this.runStructured(prompt, ClipsSchema)
  }

  async siftViralClips(request: SiftClipsRequest): Promise<Clips> {
    const prompt = buildSifterPrompt(request.transcript, request.candidates, request.reasoning)
    return this.runStructured(prompt, ClipsSchema)
  }

  private async runStructured<T extends z.ZodType>(
    prompt: BuiltPrompt<T>,
    schema: T
  ): Promise<z.infer<T>> {
    const raw = await this.client.generateJson({
      parts: [{ text: prompt.prompt }],
      systemInstruction: prompt.systemInstruction,
      schema: zodToGeminiSchema(schema),
      temperature: prompt.temperature
    })
    return parseStructured(schema, raw)
  }
}

export function guessMimeType(audioPath: string): string {
  switch (extname(audioPath).toLowerCase()) {
    case ".mp3":
      return "audio/mpeg"
    case ".wav":
      return "audio/wav"
    case ".m4a":
    case ".mp4":
      return "audio/mp4"
    case ".webm":
      return "audio/webm"
    case ".ogg":
    case ".oga":
      return "audio/ogg"
    case ".flac":
      return "audio/flac"
    case ".aac":
      return "audio/aac"
    default:
      return "audio/mpeg"
  }
}
