import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import type { Knowledge, Transcript } from "@repo/shared"
import { GeminiProvider } from "./gemini-provider"

interface CapturedRequest {
  url: string
  headers: Record<string, string>
  body: unknown
}

function jsonResponse(
  payload: unknown,
  init?: { status?: number; headers?: Record<string, string> }
): Response {
  const headers: Record<string, string> = { "content-type": "application/json", ...init?.headers }
  return new Response(JSON.stringify(payload), {
    status: init?.status ?? 200,
    headers
  })
}

function buildMockTransport(onGenerate?: (body: Record<string, unknown>) => unknown) {
  const calls: CapturedRequest[] = []
  const fetchFn = async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const url = String(input)
    const rawBody = typeof init?.body === "string" ? init.body : ""
    const headers: Record<string, string> = {}
    const rawHeaders = (init?.headers ?? {}) as Record<string, string>
    for (const [key, value] of Object.entries(rawHeaders)) {
      headers[key.toLowerCase()] = value
    }
    let body: unknown
    try {
      body = rawBody ? (JSON.parse(rawBody) as unknown) : undefined
    } catch {
      body = rawBody
    }
    calls.push({ url, headers, body })

    if (headers["x-goog-upload-command"]?.includes("start")) {
      return jsonResponse({}, { headers: { "X-Goog-Upload-URL": "https://files.example/upload?token=t1" } })
    }
    if (headers["x-goog-upload-command"]?.includes("finalize")) {
      return jsonResponse({
        file: {
          uri: "https://generativelanguage.googleapis.com/v1beta/files/sample",
          name: "files/sample",
          mimeType: "audio/mpeg"
        }
      })
    }
    if (url.includes(":generateContent")) {
      const generated = onGenerate
        ? (onGenerate((body as Record<string, unknown>) ?? {}) as unknown)
        : "plain transcription result"
      const text = typeof generated === "string" ? generated : JSON.stringify(generated)
      return jsonResponse({
        candidates: [{ content: { parts: [{ text }] } }]
      })
    }
    return jsonResponse({ error: { message: `unhandled url ${url}` } }, { status: 500 })
  }
  return { fetchFn, calls }
}

describe("GeminiProvider", () => {
  it("reports unhealthy when no api key is configured", async () => {
    const provider = new GeminiProvider({})
    expect(await provider.isHealthy()).toBe(false)
  })

  it("transcribes an audio file via upload then generateContent", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ai-gemini-"))
    const audioPath = join(dir, "sample.mp3")
    await writeFile(audioPath, Buffer.from("fake audio bytes"))

    const { fetchFn, calls } = buildMockTransport(() => "the resulting transcript")
    const provider = new GeminiProvider({ apiKey: "test-key", fetchFn })

    const result = await provider.transcribe({ audioPath })
    expect(result.provider).toBe("gemini")
    expect(result.text).toBe("the resulting transcript")
    expect(result.qualityScore).toBeGreaterThan(0)

    const urls = calls.map((call) => call.url)
    expect(urls.some((url) => url.includes("/upload/v1beta/files"))).toBe(true)
    expect(urls.some((url) => url.includes(":generateContent"))).toBe(true)
  })

  it("uploads with an audio mime type inferred from the extension", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ai-gemini-"))
    const audioPath = join(dir, "clip.wav")
    await writeFile(audioPath, Buffer.from("fake"))

    const { fetchFn, calls } = buildMockTransport(() => "text")
    const provider = new GeminiProvider({ apiKey: "test-key", fetchFn })
    await provider.transcribe({ audioPath })

    const start = calls.find((call) => call.headers["x-goog-upload-command"]?.includes("start"))
    expect(start?.headers["x-goog-upload-header-content-type"]).toBe("audio/wav")
  })

  it("extracts knowledge with a structured-output schema", async () => {
    const transcript: Transcript = {
      segments: [{ startMs: 0, endMs: 1000, text: "hello world" }]
    }
    let sawSchema = false
    const { fetchFn, calls } = buildMockTransport((body) => {
      const config = (body.generationConfig ?? {}) as Record<string, unknown>
      sawSchema = Boolean(config.responseSchema)
      return { summaries: [], topics: [], definitions: [] } as Knowledge
    })
    const provider = new GeminiProvider({ apiKey: "test-key", fetchFn })

    const knowledge = await provider.extractKnowledge({ transcript })
    expect(knowledge).toEqual({ summaries: [], topics: [], definitions: [] })
    expect(sawSchema).toBe(true)

    const generate = calls.find((call) => call.url.includes(":generateContent"))
    const requestBody = generate?.body as {
      systemInstruction?: { parts?: { text?: string }[] }
    }
    expect(requestBody?.systemInstruction?.parts?.[0]?.text).toContain("structured knowledge")
  })

  it("fails fast on transcribe when the key is missing", async () => {
    const provider = new GeminiProvider({})
    await expect(provider.transcribe({ audioPath: "/tmp/nope.mp3" })).rejects.toThrow(
      "gemini api key is not configured"
    )
  })
})
