import type { StageError, StageErrorCode, StageId } from "@repo/shared"

export interface StageExecutionErrorOptions {
  stageId: StageId
  code: StageErrorCode
  message: string
  retryable?: boolean
  details?: Record<string, unknown>
  cause?: unknown
}

export class StageExecutionError extends Error implements StageError {
  readonly stageId: StageId
  readonly code: StageErrorCode
  readonly retryable: boolean
  readonly details?: Record<string, unknown>

  constructor(options: StageExecutionErrorOptions) {
    super(options.message, { cause: options.cause })
    this.name = "StageExecutionError"
    this.stageId = options.stageId
    this.code = options.code
    this.retryable = options.retryable ?? false
    this.details = options.details
  }

  toStageError(): StageError {
    return {
      code: this.code,
      stageId: this.stageId,
      message: this.message,
      retryable: this.retryable,
      details: this.details
    }
  }
}

export function toStageError(stageId: StageId, cause: unknown): StageError {
  if (cause instanceof StageExecutionError) {
    return cause.toStageError()
  }
  if (isStageError(cause)) {
    return cause
  }
  const message = cause instanceof Error ? cause.message : String(cause)
  return {
    code: "internal",
    stageId,
    message,
    retryable: false
  }
}

export function isStageError(value: unknown): value is StageError {
  if (typeof value !== "object" || value === null) {
    return false
  }
  const candidate = value as Partial<StageError>
  return (
    typeof candidate.code === "string" &&
    typeof candidate.stageId === "string" &&
    typeof candidate.message === "string" &&
    typeof candidate.retryable === "boolean"
  )
}
