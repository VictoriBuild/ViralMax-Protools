import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  extractJson,
  formatMs,
  parseStructured,
  transcriptToText
} from "./prompt-builder"
import { AiError } from "../errors"

describe("extractJson", () => {
  it("parses raw json", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
  })

  it("strips markdown code fences", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })

  it("parses json that follows a prose prefix", () => {
    expect(extractJson('Here you go:\n[{"a":1}]')).toEqual([{ a: 1 }])
  })

  it("throws AiError for unparseable content", () => {
    expect(() => extractJson("no json here")).toThrow(AiError)
  })
})

describe("parseStructured", () => {
  const schema = z.object({
    name: z.string(),
    count: z.number().int()
  })

  it("validates parsed output against the schema", () => {
    const result = parseStructured(schema, '```json\n{"name":"clip","count":3}\n```')
    expect(result).toEqual({ name: "clip", count: 3 })
  })

  it("throws when the output does not satisfy the schema", () => {
    expect(() => parseStructured(schema, '{"name":123}')).toThrow(AiError)
  })
})

describe("transcriptToText", () => {
  it("renders timed segments when present", () => {
    const text = transcriptToText({
      text: "fallback",
      segments: [
        { startMs: 0, endMs: 1500, text: "hello" },
        { startMs: 1500, endMs: 3000, text: "world" }
      ]
    })
    expect(text).toContain("[00:00:00.000 - 00:00:01.500] hello")
    expect(text).toContain("[00:00:01.500 - 00:00:03.000] world")
  })

  it("falls back to plain text when no segments exist", () => {
    expect(transcriptToText({ text: "only text" })).toBe("only text")
  })
})

describe("formatMs", () => {
  it("formats millisecond values as hh:mm:ss.mmm", () => {
    expect(formatMs(0)).toBe("00:00:00.000")
    expect(formatMs(3_665_000)).toBe("01:01:05.000")
  })
})
