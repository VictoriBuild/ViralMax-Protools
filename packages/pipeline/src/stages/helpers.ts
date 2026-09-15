import type { ZodType } from "zod"
import type { StageId } from "@repo/shared"
import type { ValidationResult } from "../contract/stage"

export function validateAgainst(schema: ZodType): (input: unknown) => ValidationResult {
  return (input: unknown) => {
    const parsed = schema.safeParse(input)
    if (parsed.success) {
      return { ok: true }
    }
    return { ok: false, errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) }
  }
}

export function assertStageId(value: string, expected: StageId): asserts value is StageId {
  if (value !== expected) {
    throw new TypeError(`expected stage ${expected} but was ${value}`)
  }
}
