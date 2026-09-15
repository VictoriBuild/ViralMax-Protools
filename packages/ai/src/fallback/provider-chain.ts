import { AiError } from "../errors"
import type { TranscribeProvider, TranscriptionRequest, TranscriptionResult } from "../providers/transcribe-provider"
import { CircuitBreaker, type CircuitBreakerEvent } from "./circuit-breaker"

export interface ProviderChainOptions {
  timeoutMs?: number
  minQualityScore?: number
  failureThreshold?: number
  resetTimeoutMs?: number
  onEvent?: (event: ProviderChainEvent) => void
}

export interface ProviderChainResult {
  result: TranscriptionResult
  usedProvider: string
  fellBack: boolean
  attempts: number
}

export type ProviderChainEvent =
  | { type: "provider_start"; providerId: string; at: number }
  | { type: "provider_success"; providerId: string; qualityScore: number; elapsedMs: number; at: number }
  | { type: "provider_failure"; providerId: string; error: unknown; at: number }
  | { type: "provider_skipped"; providerId: string; reason: string; at: number }
  | { type: "fallback"; fromProvider: string; toProvider: string; at: number }
  | { type: "quality_rejected"; providerId: string; qualityScore: number; minQualityScore: number; at: number }
  | { type: "chain_completed"; usedProvider: string; fellBack: boolean; at: number }
  | { type: "chain_failed"; error: unknown; at: number }
  | CircuitBreakerEvent

export class ProviderChain {
  private readonly breakers = new Map<string, CircuitBreaker>()
  private readonly onEvent: ProviderChainOptions["onEvent"]

  constructor(
    private readonly providers: TranscribeProvider[],
    private readonly options: ProviderChainOptions = {}
  ) {
    this.onEvent = options.onEvent
  }

  async transcribe(request: TranscriptionRequest): Promise<ProviderChainResult> {
    let lastError: unknown
    let fellBack = false
    let attempts = 0

    for (let index = 0; index < this.providers.length; index += 1) {
      const provider = this.providers[index]!

      if (!(await provider.isHealthy())) {
        this.emit({ type: "provider_skipped", providerId: provider.id, reason: "provider unhealthy", at: Date.now() })
        fellBack = true
        continue
      }

      const breaker = this.breakerFor(provider)

      attempts += 1
      this.emit({ type: "provider_start", providerId: provider.id, at: Date.now() })
      const startedAt = Date.now()
      try {
        const result = await breaker.call(async () => {
          const transcribed = await this.runWithTimeout(provider, request)
          const minQuality = this.options.minQualityScore
          if (minQuality !== undefined && transcribed.qualityScore < minQuality) {
            this.emit({
              type: "quality_rejected",
              providerId: provider.id,
              qualityScore: transcribed.qualityScore,
              minQualityScore: minQuality,
              at: Date.now()
            })
            throw new AiError({
              providerId: provider.id,
              code: "quality_gate",
              message: `${provider.id} quality score ${transcribed.qualityScore} below minimum ${minQuality}`,
              retryable: false
            })
          }
          return transcribed
        })
        this.emit({
          type: "provider_success",
          providerId: provider.id,
          qualityScore: result.qualityScore,
          elapsedMs: Date.now() - startedAt,
          at: Date.now()
        })
        this.emit({
          type: "chain_completed",
          usedProvider: provider.id,
          fellBack,
          at: Date.now()
        })
        return { result, usedProvider: provider.id, fellBack, attempts }
      } catch (error) {
        lastError = error
        fellBack = true
        this.emit({ type: "provider_failure", providerId: provider.id, error, at: Date.now() })
        const next = this.providers[index + 1]
        if (next) {
          this.emit({
            type: "fallback",
            fromProvider: provider.id,
            toProvider: next.id,
            at: Date.now()
          })
        }
      }
    }

    const finalError = new Error(
      `all providers failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`
    )
    this.emit({ type: "chain_failed", error: finalError, at: Date.now() })
    throw finalError
  }

  breakerState(providerId: string): CircuitBreaker["currentState"] | undefined {
    return this.breakers.get(providerId)?.currentState
  }

  private breakerFor(provider: TranscribeProvider): CircuitBreaker {
    let breaker = this.breakers.get(provider.id)
    if (!breaker) {
      breaker = new CircuitBreaker(provider.id, {
        failureThreshold: this.options.failureThreshold ?? 3,
        resetTimeoutMs: this.options.resetTimeoutMs ?? 30_000,
        onEvent: (event: CircuitBreakerEvent) => {
          this.options.onEvent?.(event)
        }
      })
      this.breakers.set(provider.id, breaker)
    }
    return breaker
  }

  private emit(event: ProviderChainEvent): void {
    this.onEvent?.(event)
  }

  private async runWithTimeout(
    provider: TranscribeProvider,
    request: TranscriptionRequest
  ): Promise<TranscriptionResult> {
    const timeoutMs = this.options.timeoutMs ?? 120_000
    const result = await provider.transcribe(request)
    const elapsedMs = result.timings.completedAt - result.timings.startedAt
    if (elapsedMs > timeoutMs) {
      throw new AiError({
        providerId: provider.id,
        code: "timeout",
        message: `${provider.id} exceeded timeout of ${timeoutMs}ms`,
        retryable: true
      })
    }
    return result
  }
}
