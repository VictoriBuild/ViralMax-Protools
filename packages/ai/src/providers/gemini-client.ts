import { readFile } from "node:fs/promises"
import {
  AiError,
  classifyHttpError,
  invalidResponse,
  notConfigured,
  toAiError
} from "../errors"
import type { GeminiJsonSchema } from "../types"

export interface GeminiClientOptions {
  apiKey?: string
  endpoint?: string
  model?: string
  fetchFn?: typeof fetch
  timeoutMs?: number
  maxInlineBytes?: number
}

export interface GeminiGenerateOptions {
  parts: GeminiPart[]
  systemInstruction?: string
  temperature?: number
  schema?: GeminiJsonSchema
  responseModalities?: string[]
  signal?: AbortSignal
}

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { fileData: { mimeType: string; fileUri: string } }

export interface GeminiUploadedFile {
  uri: string
  name: string
  mimeType: string
}

interface UploadResponse {
  file?: { uri?: string; name?: string; mimeType?: string }
  uri?: string
  name?: string
  mimeType?: string
  error?: { message?: string }
}

export class GeminiClient {
  private readonly apiKey: string | undefined
  private readonly endpoint: string
  private readonly model: string
  private readonly fetchFn: typeof fetch
  private readonly timeoutMs: number
  private readonly maxInlineBytes: number

  constructor(options: GeminiClientOptions) {
    this.apiKey = options.apiKey
    this.endpoint = stripTrailingSlash(options.endpoint ?? "https://generativelanguage.googleapis.com/v1beta")
    this.model = options.model ?? "gemini-2.0-flash"
    this.fetchFn = options.fetchFn ?? fetch
    this.timeoutMs = options.timeoutMs ?? 120_000
    this.maxInlineBytes = options.maxInlineBytes ?? 19_000_000
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey)
  }

  async generateJson(options: GeminiGenerateOptions): Promise<string> {
    if (!this.apiKey) {
      throw notConfigured("gemini", "gemini api key is not configured")
    }

    const url = `${this.endpoint}/models/${this.model}:generateContent`
    const body = buildGenerateBody(this.model, options)

    const response = await this.requestJson(url, body, options.signal)
    const text = extractResponseText(response)
    if (text.length === 0) {
      throw invalidResponse("gemini", "gemini generateContent returned empty response")
    }
    return text
  }

  async uploadFile(path: string, mimeType: string, displayName: string): Promise<GeminiUploadedFile> {
    if (!this.apiKey) {
      throw notConfigured("gemini", "gemini api key is not configured")
    }

    const data = await readFile(path)
    if (data.byteLength > this.maxInlineBytes) {
      throw invalidResponse(
        "gemini",
        `file too large for inline transcription: ${path} (${data.byteLength} bytes)`
      )
    }

    const { uploadHost, apiVersion } = splitEndpoint(this.endpoint)
    const url = `${uploadHost}/upload/${apiVersion}/files?key=${encodeURIComponent(this.apiKey)}`
    const headers = {
      "Content-Type": "application/json",
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(data.byteLength),
      "X-Goog-Upload-Header-Content-Type": mimeType
    }
    const metadata = JSON.stringify({ file: { display_name: displayName } })

    const session = await this.rawRequest(url, metadata, headers)
    const uploadUrl = session.headers.get("X-Goog-Upload-URL")
    if (!uploadUrl) {
      throw invalidResponse("gemini", "upload session did not return an upload URL")
    }

    const uploadHeaders = {
      "Content-Length": String(data.byteLength),
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0"
    }
    const uploadBody = data as unknown as Uint8Array
    const raw = await this.rawRequest(uploadUrl, uploadBody, uploadHeaders)
    const payload = (await safeJson(raw)) as UploadResponse

    const uri = payload.file?.uri ?? payload.uri
    const name = payload.file?.name ?? payload.name
    const mime = payload.file?.mimeType ?? payload.mimeType
    if (!uri || !name) {
      throw invalidResponse("gemini", `upload completed without a file reference: ${JSON.stringify(payload)}`)
    }
    return { uri, name, mimeType: mime ?? mimeType }
  }

  private async requestJson(
    url: string,
    body: unknown,
    signal?: AbortSignal
  ): Promise<Record<string, unknown>> {
    const key = this.apiKey ?? ""
    const fullUrl = `${url}?key=${encodeURIComponent(key)}`
    const raw = await this.rawRequest(
      fullUrl,
      JSON.stringify(body),
      { "Content-Type": "application/json" },
      signal
    )
    const payload = (await safeJson(raw)) as { error?: { message?: string }; candidates?: unknown }
    if (!raw.ok) {
      throw classifyHttpError("gemini", raw.status, payload.error?.message ?? `http ${raw.status}`, payload)
    }
    return payload as Record<string, unknown>
  }

  private async rawRequest(
    url: string,
    body: string | Uint8Array | undefined,
    headers: Record<string, string>,
    signal?: AbortSignal
  ): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    const onOuterAbort = (): void => controller.abort()
    if (signal) {
      if (signal.aborted) {
        controller.abort()
      } else {
        signal.addEventListener("abort", onOuterAbort, { once: true })
      }
    }
    try {
      const init: Record<string, unknown> = {
        method: "POST",
        headers,
        signal: controller.signal
      }
      if (body !== undefined) {
        init.body = body
      }
      const response = await this.fetchFn(url, init as unknown as RequestInit)
      return response
    } catch (error) {
      throw toAiError("gemini", error)
    } finally {
      clearTimeout(timer)
      if (signal) {
        signal.removeEventListener("abort", onOuterAbort)
      }
    }
  }
}

function buildGenerateBody(model: string, options: GeminiGenerateOptions): unknown {
  const contents = [{ role: "user", parts: options.parts }]
  const generationConfig: Record<string, unknown> = {}
  if (options.schema) {
    generationConfig.responseMimeType = "application/json"
    generationConfig.responseSchema = options.schema
  }
  if (options.temperature !== undefined) {
    generationConfig.temperature = options.temperature
  }
  if (options.responseModalities) {
    generationConfig.responseModalities = options.responseModalities
  }
  return {
    model: `models/${model}`,
    contents,
    ...(options.systemInstruction
      ? { systemInstruction: { parts: [{ text: options.systemInstruction }] } }
      : {}),
    generationConfig
  }
}

function extractResponseText(payload: Record<string, unknown>): string {
  const candidates = payload["candidates"]
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw invalidResponse("gemini", `generateContent returned no candidates: ${JSON.stringify(payload).slice(0, 500)}`)
  }
  const parts = candidates[0] as { content?: { parts?: { text?: string }[] } }
  const textParts = parts?.content?.parts?.filter((part) => typeof part.text === "string" && part.text) ?? []
  return textParts.map((part) => part.text ?? "").join("\n")
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch (error) {
    throw invalidResponse("gemini", `provider returned non-json response (http ${response.status})`, error)
  }
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value
}

function splitEndpoint(endpoint: string): { uploadHost: string; apiVersion: string } {
  const url = new URL(endpoint)
  const segments = url.pathname.split("/").filter(Boolean)
  const apiVersion = segments[0] ?? "v1beta"
  return { uploadHost: `${url.protocol}//${url.host}`, apiVersion }
}

export function classifyGeminiError(error: unknown): AiError {
  if (error instanceof AiError) {
    return error
  }
  return toAiError("gemini", error)
}
