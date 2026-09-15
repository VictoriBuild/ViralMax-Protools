import type { z } from "zod"
import { AiError } from "../errors"

export interface TranscriptLike {
  text?: string
  segments?: { startMs: number; endMs: number; text: string; confidence?: number }[]
}

export const MIN_QUALITY_SCORE = 0.5
export const MAX_CLIP_CANDIDATES = 8

export interface PromptTemplate<T extends z.ZodType> {
  name: string
  systemInstruction: string
  schema: T
  temperature?: number
}

export interface BuiltPrompt<T extends z.ZodType> {
  name: string
  systemInstruction: string
  prompt: string
  schema: T
  temperature?: number
}

export class PromptBuilder<T extends z.ZodType> {
  private readonly sections: { label: string; content: string }[] = []

  constructor(private readonly template: PromptTemplate<T>) {}

  section(label: string, value: unknown): this {
    this.sections.push({ label, content: renderValue(value) })
    return this
  }

  build(): BuiltPrompt<T> {
    const parts: string[] = []
    for (const { label, content } of this.sections) {
      parts.push(`${label}:\n${content}`)
    }
    return {
      name: this.template.name,
      systemInstruction: this.template.systemInstruction,
      prompt: parts.join("\n\n"),
      schema: this.template.schema,
      temperature: this.template.temperature
    }
  }

  parseResponse(text: string): z.infer<T> {
    return parseStructured(this.template.schema, text)
  }
}

function renderValue(value: unknown): string {
  if (typeof value === "string") {
    return value
  }
  if (value === undefined) {
    return ""
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const CODE_FENCE = /^```(?:json)?\s*([\s\S]*?)\s*```$/i

export function extractJson(text: string): unknown {
  const trimmed = text.trim()
  const fenced = CODE_FENCE.exec(trimmed)
  const candidate = fenced?.[1] ?? trimmed

  let raw = candidate
  const first = candidate.search(/[[{]/)
  if (first > 0) {
    raw = candidate.slice(first)
  }

  const parsed = tryParse(raw) ?? tryParse(candidate) ?? tryParse(trimmed)
  if (parsed === undefined) {
    throw new AiError({
      providerId: "prompt",
      code: "invalid_response",
      message: `could not parse structured JSON response from provider (first 200 chars: ${truncate(trimmed, 200)})`,
      retryable: false
    })
  }
  return parsed
}

function tryParse(text: string): unknown | undefined {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

function truncate(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, length)}...`
}

export function parseStructured<T extends z.ZodType>(schema: T, text: string): z.infer<T> {
  const raw = extractJson(text)
  const result = schema.safeParse(raw)
  if (!result.success) {
    throw new AiError({
      providerId: "prompt",
      code: "invalid_response",
      message: `provider response failed schema validation: ${result.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
        .join("; ")}`,
      retryable: false
    })
  }
  return result.data
}

export function transcriptToText(transcript: TranscriptLike): string {
  if (transcript.segments && transcript.segments.length > 0) {
    return transcript.segments
      .map((segment) => {
        const start = formatMs(segment.startMs)
        const end = formatMs(segment.endMs)
        return `[${start} - ${end}] ${segment.text}`
      })
      .join("\n")
  }
  return transcript.text ?? ""
}

export function transcriptForPrompt(transcript: TranscriptLike): string {
  const maxChars = 24000
  const content = transcriptToText(transcript)
  return content.length <= maxChars ? content : `${content.slice(0, maxChars)}\n[transcript truncated]`
}

export function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const seconds = totalSeconds % 60
  const minutes = Math.floor(totalSeconds / 60) % 60
  const hours = Math.floor(totalSeconds / 3600)
  const pad = (value: number): string => value.toString().padStart(2, "0")
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${(ms % 1000).toString().padStart(3, "0")}`
}
