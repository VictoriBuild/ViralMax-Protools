import { describe, expect, it } from "vitest"
import { KnowledgeSchema } from "@repo/shared"
import {
  buildEditorialPrompt,
  buildKnowledgePrompt,
  buildSifterPrompt
} from "./tasks"
import { parseStructured } from "./prompt-builder"

const transcript = {
  segments: [
    { startMs: 0, endMs: 2000, text: "this product changes everything" },
    { startMs: 2000, endMs: 4000, text: "nobody believes me yet" }
  ],
  language: "en",
  source: "speech_recognition" as const
}

const knowledge = {
  summaries: [{ title: "Launch", text: "Announces a transformative product." }],
  topics: [{ topic: "product", mentions: 2 }],
  definitions: []
}

describe("knowledge prompt", () => {
  it("embeds transcript segments and schema", () => {
    const prompt = buildKnowledgePrompt(transcript)
    expect(prompt.name).toBe("knowledge")
    expect(prompt.systemInstruction).toContain("structured knowledge")
    expect(prompt.prompt).toContain("this product changes everything")
    expect(prompt.prompt).toContain("[00:00:00.000 - 00:00:02.000]")
    expect(prompt.schema).toBe(KnowledgeSchema)
  })

  it("parses a model response that satisfies the knowledge schema", () => {
    const prompt = buildKnowledgePrompt(transcript)
    const parsed = parseStructured(prompt.schema, JSON.stringify(knowledge))
    expect(parsed.summaries).toHaveLength(1)
    expect(parsed.summaries[0]!.title).toBe("Launch")
  })
})

describe("editorial prompt", () => {
  it("includes transcript and knowledge digest", () => {
    const prompt = buildEditorialPrompt(transcript, knowledge)
    expect(prompt.name).toBe("editorial")
    expect(prompt.prompt).toContain("Announces a transformative product.")
    expect(prompt.prompt).toContain("this product changes everything")
    expect(prompt.temperature).toBe(0.4)
  })
})

describe("sifter prompt", () => {
  it("includes candidate windows and optional reasoning", () => {
    const prompt = buildSifterPrompt(
      transcript,
      [{ startMs: 0, endMs: 2000 }],
      "editors flagged the opening hook"
    )
    expect(prompt.name).toBe("sifter")
    expect(prompt.prompt).toContain("Candidate clips")
    expect(prompt.prompt).toContain("editors flagged the opening hook")
    expect(prompt.prompt).toContain("Keep at most 5 clips.")
    expect(prompt.temperature).toBe(0.2)
  })
})
