import { describe, expect, it } from "vitest"
import { z } from "zod"
import { zodToGeminiSchema } from "./gemini-schema"

describe("zodToGeminiSchema", () => {
  it("converts an object with required and optional fields", () => {
    const schema = z.object({
      id: z.string(),
      count: z.number().optional()
    })
    const converted = zodToGeminiSchema(schema)
    expect(converted).toEqual({
      type: "OBJECT",
      properties: {
        id: { type: "STRING" },
        count: { type: "NUMBER", nullable: true }
      },
      required: ["id"]
    })
  })

  it("keeps defaulted arrays as required and converts their element type", () => {
    const schema = z.object({
      labels: z.array(z.string()).default([])
    })
    const converted = zodToGeminiSchema(schema)
    expect(converted).toEqual({
      type: "OBJECT",
      properties: {
        labels: { type: "ARRAY", items: { type: "STRING" } }
      },
      required: ["labels"]
    })
  })

  it("converts enum schemas to string enums", () => {
    const schema = z.object({
      source: z.enum(["platform_captions", "speech_recognition"])
    })
    const converted = zodToGeminiSchema(schema)
    const properties = (converted.properties ?? {}) as Record<string, { enum?: string[] }>
    expect(properties.source).toEqual({ type: "STRING", enum: ["platform_captions", "speech_recognition"] })
  })

  it("converts nested arrays of objects", () => {
    const schema = z.object({
      items: z.array(z.object({ name: z.string(), score: z.number() }))
    })
    const converted = zodToGeminiSchema(schema)
    expect(converted).toEqual({
      type: "OBJECT",
      properties: {
        items: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              name: { type: "STRING" },
              score: { type: "NUMBER" }
            },
            required: ["name", "score"]
          }
        }
      },
      required: ["items"]
    })
  })

  it("treats literals as scalars and booleans as booleans", () => {
    expect(zodToGeminiSchema(z.literal("x"))).toEqual({ type: "STRING", enum: ["x"] })
    expect(zodToGeminiSchema(z.literal(3))).toEqual({ type: "NUMBER" })
    expect(zodToGeminiSchema(z.boolean())).toEqual({ type: "BOOLEAN" })
  })
})
