import type { z } from "zod"

type GeminiSchema = Record<string, unknown>

interface ZodDefLike {
  type?: string
  innerType?: ZodNodeLike
  element?: ZodNodeLike
  entries?: Record<string, string>
  values?: readonly unknown[]
  shape?: Record<string, ZodNodeLike>
  valueType?: ZodNodeLike
}

interface ZodNodeLike {
  _zod?: { def?: ZodDefLike }
}

interface Unwrapped {
  node: ZodNodeLike
  optional: boolean
}

function defOf(node: ZodNodeLike): ZodDefLike | undefined {
  return node._zod?.def
}

function unwrap(node: ZodNodeLike): Unwrapped {
  let current = node
  let optional = false
  for (;;) {
    const def = defOf(current)
    if (def?.type === "optional" || def?.type === "nullable" || def?.type === "default") {
      if (def.type === "optional") {
        optional = true
      }
      const inner = def.innerType
      if (!inner) {
        break
      }
      current = inner
      continue
    }
    break
  }
  return { node: current, optional }
}

export function zodToGeminiSchema(schema: z.ZodTypeAny): GeminiSchema {
  const { node, optional } = unwrap(schema as unknown as ZodNodeLike)
  const converted = convert(node)
  if (optional) {
    converted.nullable = true
  }
  return converted
}

function convert(node: ZodNodeLike): GeminiSchema {
  const def = defOf(node)
  if (!def) {
    return { type: "STRING" }
  }
  const type = def.type
  switch (type) {
    case "string":
      return { type: "STRING" }
    case "number":
    case "bigint":
      return { type: "NUMBER" }
    case "boolean":
      return { type: "BOOLEAN" }
    case "enum": {
      const entries = def.entries ?? {}
      return { type: "STRING", enum: Object.keys(entries) }
    }
    case "literal": {
      const value = def.values?.[0]
      if (typeof value === "number") {
        return { type: "NUMBER" }
      }
      if (typeof value === "boolean") {
        return { type: "BOOLEAN" }
      }
      return { type: "STRING", enum: [String(value)] }
    }
    case "array": {
      return {
        type: "ARRAY",
        items: def.element ? zodToGeminiSchema(def.element as unknown as z.ZodTypeAny) : { type: "STRING" }
      }
    }
    case "record": {
      return {
        type: "OBJECT",
        additionalProperties: def.valueType
          ? zodToGeminiSchema(def.valueType as unknown as z.ZodTypeAny)
          : { type: "STRING" }
      }
    }
    case "object": {
      const shape = def.shape ?? {}
      const properties: Record<string, GeminiSchema> = {}
      const required: string[] = []
      for (const [key, fieldNode] of Object.entries(shape)) {
        properties[key] = zodToGeminiSchema(fieldNode as unknown as z.ZodTypeAny)
        const { optional } = unwrap(fieldNode)
        if (!optional) {
          required.push(key)
        }
      }
      return {
        type: "OBJECT",
        properties,
        ...(required.length > 0 ? { required } : {})
      }
    }
    case "date":
      return { type: "STRING" }
    case "null":
      return { type: "STRING", nullable: true }
    default:
      return { type: "STRING" }
  }
}
