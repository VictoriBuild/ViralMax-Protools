import { describe, expect, it } from "vitest"
import {
  WhisperCppProvider,
  computeQualityScore,
  extractWhisperJson,
  parseWhisperStdout
} from "./whisper-provider"
import { AiError } from "../errors"

const sampleJson = [
  "{",
  '  "systeminfo": "whisper.cpp",',
  '  "model": { "type": "tiny" },',
  '  "result": { "language": "en" },',
  '  "transcription": [',
  '    { "timestamps": { "from": "00:00:00,000", "to": "00:00:02,000" }, "offsets": { "from": 0, "to": 2 }, "text": "hello world" },',
  '    { "timestamps": { "from": "00:00:02,000", "to": "00:00:05,000" }, "offsets": { "from": 2, "to": 5 }, "text": "second part here" }',
  "  ]",
  "}"
].join("\n")

describe("extractWhisperJson", () => {
  it("extracts json preceded by console output", () => {
    const stdout = `\nhello from the plain log\n\n${sampleJson}\n`
    const parsed = extractWhisperJson(stdout)
    expect(parsed?.transcription).toHaveLength(2)
  })

  it("returns undefined without a transcription array", () => {
    expect(extractWhisperJson('{"systeminfo":"x"}')).toBeUndefined()
  })
})

describe("parseWhisperStdout", () => {
  it("maps segments to TranscriptionResult fields", () => {
    const parsed = parseWhisperStdout(sampleJson)
    expect(parsed.language).toBe("en")
    expect(parsed.text).toBe("hello world second part here")
    expect(parsed.segments).toEqual([
      { startMs: 0, endMs: 2000, text: "hello world" },
      { startMs: 2000, endMs: 5000, text: "second part here" }
    ])
  })

  it("throws AiError when no segments are present", () => {
    expect(() => parseWhisperStdout('{"result":{}}')).toThrow(AiError)
  })
})

describe("computeQualityScore", () => {
  it("scores full continuous coverage highly", () => {
    const score = computeQualityScore(
      [
        { startMs: 0, endMs: 4000, text: "one" },
        { startMs: 4000, endMs: 10_000, text: "two" }
      ],
      10_000
    )
    expect(score).toBe(1)
  })

  it("penalizes empty segments and long gaps", () => {
    const score = computeQualityScore(
      [
        { startMs: 0, endMs: 1000, text: "one" },
        { startMs: 5000, endMs: 6000, text: "" },
        { startMs: 8000, endMs: 9000, text: "three" }
      ],
      10_000
    )
    expect(score).toBeLessThan(0.5)
  })

  it("returns zero when there is no audio or no segments", () => {
    expect(computeQualityScore([], 1000)).toBe(0)
    expect(computeQualityScore([{ startMs: 0, endMs: 500, text: "x" }], 0)).toBe(0)
  })
})

describe("WhisperCppProvider", () => {
  it("reports unhealthy without a binary or model path", async () => {
    const provider = new WhisperCppProvider({})
    expect(await provider.isHealthy()).toBe(false)
    await expect(
      provider.transcribe({ audioPath: "/tmp/a.mp3" })
    ).rejects.toThrow("whisper binary and model path are required")
  })
})
