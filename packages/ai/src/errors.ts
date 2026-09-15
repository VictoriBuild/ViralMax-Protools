export type AiErrorCode =
  | "not_configured"
  | "auth"
  | "rate_limit"
  | "network"
  | "timeout"
  | "provider_unavailable"
  | "invalid_response"
  | "quality_gate"
  | "circuit_open"
  | "cancelled"
  | "internal"

export interface AiErrorOptions {
  providerId: string
  code: AiErrorCode
  message: string
  retryable: boolean
  details?: Record<string, unknown>
  cause?: unknown
}

export class AiError extends Error implements AiErrorOptions {
  readonly providerId: string
  readonly code: AiErrorCode
  readonly retryable: boolean
  readonly details?: Record<string, unknown>

  constructor(options: AiErrorOptions) {
    super(options.message, { cause: options.cause })
    this.name = "AiError"
    this.providerId = options.providerId
    this.code = options.code
    this.retryable = options.retryable
    this.details = options.details
  }
}

export function notConfigured(providerId: string, message: string): AiError {
  return new AiError({ providerId, code: "not_configured", message, retryable: true })
}

export function networkError(providerId: string, cause: unknown): AiError {
  const message = cause instanceof Error ? cause.message : String(cause)
  return new AiError({ providerId, code: "network", message, retryable: true, cause })
}

export function rateLimit(providerId: string, retryAfterMs?: number, cause?: unknown): AiError {
  return new AiError({
    providerId,
    code: "rate_limit",
    message: "rate limited by provider",
    retryable: true,
    details: retryAfterMs !== undefined ? { retryAfterMs } : undefined,
    cause
  })
}

export function authError(providerId: string, message: string, cause?: unknown): AiError {
  return new AiError({ providerId, code: "auth", message, retryable: false, cause })
}

export function invalidResponse(providerId: string, message: string, cause?: unknown): AiError {
  return new AiError({ providerId, code: "invalid_response", message, retryable: false, cause })
}

export function providerUnavailable(providerId: string, message: string, cause?: unknown): AiError {
  return new AiError({
    providerId,
    code: "provider_unavailable",
    message,
    retryable: true,
    cause
  })
}

export function isAiError(value: unknown): value is AiError {
  return value instanceof AiError
}

export function classifyHttpError(providerId: string, status: number, message: string, cause?: unknown): AiError {
  if (status === 401 || status === 403) {
    return authError(providerId, message, cause)
  }
  if (status === 429) {
    return rateLimit(providerId, undefined, cause)
  }
  if (status >= 500) {
    return new AiError({
      providerId,
      code: "provider_unavailable",
      message: `provider error ${status}: ${message}`,
      retryable: true,
      cause
    })
  }
  return new AiError({
    providerId,
    code: "internal",
    message: `unexpected http status ${status}: ${message}`,
    retryable: false,
    cause
  })
}

export function toAiError(providerId: string, cause: unknown): AiError {
  if (cause instanceof AiError) {
    return cause.providerId === providerId ? cause : new AiError({ ...cause, providerId })
  }
  if (cause instanceof Error && cause.name === "AbortError") {
    return new AiError({ providerId, code: "cancelled", message: "request cancelled", retryable: false, cause })
  }
  const details = cause instanceof Error ? { name: cause.name } : undefined
  return new AiError({
    providerId,
    code: "network",
    message: cause instanceof Error ? cause.message : String(cause),
    retryable: true,
    details,
    cause
  })
}
