export type CircuitState = "closed" | "open" | "half-open"

export interface CircuitBreakerOptions {
  failureThreshold: number
  resetTimeoutMs: number
  onEvent?: (event: CircuitBreakerEvent) => void
}

export interface CircuitBreakerStateChanged {
  type: "state_changed"
  providerId: string
  state: CircuitState
  previousState: CircuitState
  failureCount: number
  at: number
}

export interface CircuitBreakerResult {
  type: "result"
  providerId: string
  ok: boolean
  error?: unknown
  state: CircuitState
  failureCount: number
  at: number
}

export type CircuitBreakerEvent = CircuitBreakerStateChanged | CircuitBreakerResult

export class CircuitBreaker {
  private state: CircuitState = "closed"
  private consecutiveFailures = 0
  private openedAt = 0
  private readonly providerId: string

  constructor(
    providerId: string,
    private readonly options: CircuitBreakerOptions
  ) {
    this.providerId = providerId
  }

  get currentState(): CircuitState {
    return this.state
  }

  get failureCount(): number {
    return this.consecutiveFailures
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open" && Date.now() - this.openedAt >= this.options.resetTimeoutMs) {
      this.transition("half-open")
    }
    if (this.state === "open") {
      this.emitResult(false, new Error("circuit open"))
      throw new Error("circuit open")
    }

    try {
      const result = await fn()
      this.onSuccess()
      this.emitResult(true)
      return result
    } catch (error) {
      this.onFailure()
      this.emitResult(false, error)
      throw error
    }
  }

  recordSuccess(): void {
    this.onSuccess()
    this.emitResult(true)
  }

  recordFailure(error: unknown): void {
    this.onFailure()
    this.emitResult(false, error)
  }

  private onSuccess(): void {
    if (this.state === "open" || this.state === "half-open") {
      this.transition("closed")
    }
    this.consecutiveFailures = 0
  }

  private onFailure(): void {
    this.consecutiveFailures += 1
    if (this.state === "half-open" || this.consecutiveFailures >= this.options.failureThreshold) {
      this.transition("open")
      this.openedAt = Date.now()
    }
  }

  private transition(next: CircuitState): void {
    const previous = this.state
    if (previous === next) {
      return
    }
    this.state = next
    this.options.onEvent?.({
      type: "state_changed",
      providerId: this.providerId,
      state: next,
      previousState: previous,
      failureCount: this.consecutiveFailures,
      at: Date.now()
    })
  }

  private emitResult(ok: boolean, error?: unknown): void {
    this.options.onEvent?.({
      type: "result",
      providerId: this.providerId,
      ok,
      error,
      state: this.state,
      failureCount: this.consecutiveFailures,
      at: Date.now()
    })
  }
}
