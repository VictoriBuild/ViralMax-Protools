import { describe, expect, it } from "vitest"
import { CircuitBreaker, type CircuitBreakerEvent } from "./circuit-breaker"

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

describe("CircuitBreaker", () => {
  it("stays closed on success and resets failure count", async () => {
    const breaker = new CircuitBreaker("p", { failureThreshold: 2, resetTimeoutMs: 1000 })
    await breaker.call(() => Promise.resolve(1))
    await breaker.call(() => Promise.resolve(2))
    expect(breaker.currentState).toBe("closed")
    expect(breaker.failureCount).toBe(0)
  })

  it("opens after consecutive failures and rejects while open", async () => {
    const events: CircuitBreakerEvent[] = []
    const breaker = new CircuitBreaker("p", {
      failureThreshold: 2,
      resetTimeoutMs: 10_000,
      onEvent: (event) => events.push(event)
    })
    const failing = (): Promise<never> => Promise.reject(new Error("boom"))

    await expect(breaker.call(failing)).rejects.toThrow("boom")
    expect(breaker.currentState).toBe("closed")

    await expect(breaker.call(failing)).rejects.toThrow("boom")
    expect(breaker.currentState).toBe("open")

    await expect(breaker.call(() => Promise.resolve(1))).rejects.toThrow("circuit open")
    expect(breaker.currentState).toBe("open")

    expect(events.map((event) => event.type)).toEqual([
      "result",
      "state_changed",
      "result",
      "result"
    ])
  })

  it("recovers to half-open after the reset window and closes on success", async () => {
    const breaker = new CircuitBreaker("p", { failureThreshold: 1, resetTimeoutMs: 20 })
    await expect(breaker.call(() => Promise.reject(new Error("x")))).rejects.toThrow()
    expect(breaker.currentState).toBe("open")

    await delay(40)
    const value = await breaker.call(() => Promise.resolve(7))
    expect(value).toBe(7)
    expect(breaker.currentState).toBe("closed")
  })

  it("reopens when a half-open probe fails", async () => {
    const breaker = new CircuitBreaker("p", { failureThreshold: 1, resetTimeoutMs: 20 })
    await expect(breaker.call(() => Promise.reject(new Error("x")))).rejects.toThrow()

    await delay(40)
    await expect(breaker.call(() => Promise.reject(new Error("y")))).rejects.toThrow("y")
    expect(breaker.currentState).toBe("open")
  })

  it("reports manual success and failure records", () => {
    const breaker = new CircuitBreaker("p", { failureThreshold: 1, resetTimeoutMs: 1000 })
    breaker.recordSuccess()
    expect(breaker.currentState).toBe("closed")
    breaker.recordFailure(new Error("x"))
    expect(breaker.currentState).toBe("open")
    expect(breaker.failureCount).toBe(1)
  })
})
