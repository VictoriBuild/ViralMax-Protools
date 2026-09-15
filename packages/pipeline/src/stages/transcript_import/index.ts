import { readFile } from "node:fs/promises"
import type { TranscriptImportInput, TranscriptImportOutput, TranscriptSegment, VideoSource } from "@repo/shared"
import { TranscriptImportInputSchema } from "@repo/shared"
import type { PipelineStage } from "../../contract/stage"
import { StageExecutionError } from "../../contract/errors"
import { captionsFileFor } from "../../io/captions"
import { validateAgainst } from "../helpers"

export interface CaptionsImporter {
  importCaptions: (source: VideoSource) => Promise<{ segments: TranscriptSegment[]; language?: string }>
}

interface CaptionCue {
  startMs: number
  endMs: number
  lines: string[]
}

function parseTimecode(value: string): number {
  const normalized = value.trim().replace(",", ".")
  const parts = normalized.split(":")
  if (parts.length < 2) {
    return 0
  }
  const last = parts[parts.length - 1] ?? "0"
  const dotIndex = last.indexOf(".")
  const secondsPart = dotIndex >= 0 ? last.slice(0, dotIndex) : last
  const fractionPart = dotIndex >= 0 ? last.slice(dotIndex + 1) : ""
  const seconds = Number.parseInt(secondsPart, 10)
  const fraction = fractionPart.length > 0 ? Number(`0.${fractionPart}`) : 0
  const minutes = Number.parseInt(parts[parts.length - 2] ?? "0", 10)
  const hours = parts.length > 2 ? Number.parseInt(parts[parts.length - 3] ?? "0", 10) : 0
  const totalSeconds = hours * 3600 + minutes * 60 + seconds + fraction
  return Math.round(totalSeconds * 1000)
}

function toSegments(cues: CaptionCue[]): TranscriptSegment[] {
  return cues
    .map((cue) => {
      const text = cue.lines.join(" ").trim()
      if (text.length === 0 || cue.endMs < cue.startMs) {
        return undefined
      }
      return { startMs: cue.startMs, endMs: cue.endMs, text }
    })
    .filter((segment): segment is TranscriptSegment => segment !== undefined)
    .sort((a, b) => a.startMs - b.startMs)
}

function parseVtt(text: string): CaptionCue[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/)
  const cues: CaptionCue[] = []
  let current: CaptionCue | undefined

  const flush = (): void => {
    if (current) {
      cues.push(current)
      current = undefined
    }
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = (lines[i] ?? "").trimEnd()
    const timing = line.match(
      /^(\d{1,2}:\d{2}:\d{2}\.\d{1,3}|\d{1,2}:\d{2}\.\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}\.\d{1,3}|\d{1,2}:\d{2}\.\d{1,3})/
    )
    if (timing) {
      flush()
      current = { startMs: parseTimecode(timing[1] ?? ""), endMs: parseTimecode(timing[2] ?? ""), lines: [] }
      continue
    }
    if (line.trim() === "") {
      flush()
      continue
    }
    if (current && !line.trim().startsWith("NOTE")) {
      current.lines.push(line.trim())
    }
  }
  flush()
  return cues
}

function parseSrt(text: string): CaptionCue[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/)
  const cues: CaptionCue[] = []
  let current: CaptionCue | undefined
  const pendingText: string[] = []

  const flush = (): void => {
    if (current) {
      current.lines.push(...pendingText)
      pendingText.length = 0
      cues.push(current)
      current = undefined
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!current) {
      const timing = line.match(
        /^(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})/
      )
      if (timing) {
        current = { startMs: parseTimecode(timing[1] ?? ""), endMs: parseTimecode(timing[2] ?? ""), lines: [] }
      }
      continue
    }
    if (line === "") {
      flush()
    } else {
      pendingText.push(line)
    }
  }
  flush()
  return cues
}

function parseJsonCaptions(text: string): CaptionCue[] {
  const parsed: unknown = JSON.parse(text)
  const candidates = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" && parsed !== null
      ? ((parsed as Record<string, unknown>).segments ??
        (parsed as Record<string, unknown>).captions ??
        [])
      : []
  return (candidates as unknown[]).flatMap((raw) => {
    if (typeof raw !== "object" || raw === null) {
      return []
    }
    const item = raw as Record<string, unknown>
    const textValue = typeof item.text === "string" ? item.text : typeof item.content === "string" ? item.content : ""
    const startValue = typeof item.startMs === "number" ? item.startMs : typeof item.start === "number" ? item.start : undefined
    const endValue = typeof item.endMs === "number" ? item.endMs : typeof item.end === "number" ? item.end : undefined
    if (textValue.trim() === "" || startValue === undefined || endValue === undefined) {
      return []
    }
    return [{ startMs: startValue, endMs: endValue, lines: [textValue.trim()] }]
  })
}

export const defaultCaptionsImporter: CaptionsImporter = {
  async importCaptions(source: VideoSource): Promise<{ segments: TranscriptSegment[]; language?: string }> {
    if (source.kind === "url") {
      throw new StageExecutionError({
        stageId: "transcript_import",
        code: "provider_unavailable",
        message: "fetching platform captions is not configured in v1",
        retryable: true
      })
    }
    const captionsFile = captionsFileFor(source)
    if (!captionsFile) {
      throw new StageExecutionError({
        stageId: "transcript_import",
        code: "provider_unavailable",
        message: "no caption sidecar found for the source media",
        retryable: true
      })
    }
    const content = await readFile(captionsFile, "utf8")
    const extension = captionsFile.slice(captionsFile.lastIndexOf(".")).toLowerCase()
    let cues: CaptionCue[]
    try {
      if (extension === ".srt") {
        cues = parseSrt(content)
      } else if (extension === ".json") {
        cues = parseJsonCaptions(content)
      } else {
        cues = parseVtt(content)
      }
    } catch {
      throw new StageExecutionError({
        stageId: "transcript_import",
        code: "validation",
        message: `failed to parse caption file: ${captionsFile}`,
        retryable: false
      })
    }
    const segments = toSegments(cues)
    if (segments.length === 0) {
      throw new StageExecutionError({
        stageId: "transcript_import",
        code: "validation",
        message: "caption file did not contain any usable cues",
        retryable: false
      })
    }
    return { segments }
  }
}

export function createTranscriptImportStage(
  importer: CaptionsImporter = defaultCaptionsImporter
): PipelineStage<"transcript_import"> {
  return {
    id: "transcript_import",
    version: "1.0.0",
    execution: "local",
    description: "Imports a transcript from available captions",
    validate: validateAgainst(TranscriptImportInputSchema),
    async run(runtime, input: TranscriptImportInput) {
      runtime.signal.throwIfAborted()
      runtime.reportProgress(10, "looking up captions")
      const imported = await importer.importCaptions(input.video)
      runtime.signal.throwIfAborted()
      runtime.reportProgress(70, "normalizing caption cues")
      const fullText = imported.segments.map((segment) => segment.text).join(" ")
      const output: TranscriptImportOutput = {
        transcript: {
          segments: imported.segments,
          language: imported.language,
          source: "platform_captions",
          fullText
        },
        captionsAvailable: true
      }
      runtime.reportProgress(100, "captions imported")
      return output
    }
  }
}

export const transcriptImportStage = createTranscriptImportStage()
