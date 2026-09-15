import { describe, expect, it } from "vitest"
import type { TranscribeProvider, TranscriptionRequest, TranscriptionResult } from "../providers/transcribe-provider"
import { ProviderChain, type ProviderChainEvent } from "./provider-chain"

function makeProvider(
  id: string,
  handler: (request: TranscriptionRequest) => Promise<TranscriptionResult>
): TranscribeProvider {
  return {
    id,
    isHealthy: async () => true,
    transcribe: handler
  }
}

function result(provider: string, qualityScore: number): TranscriptionResult {
  const now = Date.now()
  return {
    text: `${provider} transcript`,
    provider,
    qualityScore,
    timings: { startedAt: now - 1000, completedAt: now }
  }
}

const request: TranscriptionRequest = { audioPath: "/tmp/a.mp3" }

describe("ProviderChain", () => {
  it("uses the primary provider when it succeeds", async () => {
    const events: ProviderChainEvent[] = []
    const chain = new ProviderChain(
      [
        makeProvider("gemini", async () => result("gemini", 0.9)),
        makeProvider("whisper", async () => result("whisper", 0.8))
      ],
      { onEvent: (event) => events.push(event) }
    )
    const outcome = await chain.transcribe(request)
    expect(outcome.usedProvider).toBe("gemini")
    expect(outcome.fellBack).toBe(false)
    expect(outcome.attempts).toBe(1)
    expect(events.map((event) => event.type)).toContain("chain_completed")
  })

  it("falls back to the next provider when the primary fails", async () => {
    const events: ProviderChainEvent[] = []
    const chain = new ProviderChain(
      [
        makeProvider("gemini", async () => {
          throw new Error("gemini down")
        }),
        makeProvider("whisper", async () => result("whisper", 0.85))
      ],
      { onEvent: (event) => events.push(event) }
    )
    const outcome = await chain.transcribe(request)
    expect(outcome.usedProvider).toBe("whisper")
    expect(outcome.fellBack).toBe(true)
    expect(outcome.attempts).toBe(2)

    const types = events.map((event) => event.type)
    expect(types).toContain("provider_failure")
    expect(types).toContain("fallback")
    const completed = events.find((event) => event.type === "chain_completed")
    expect(completed).toBeDefined()
  })

  it("skips unhealthy providers without counting an attempt", async () => {
    const chain = new ProviderChain([
      {
        ...makeProvider("offline", async () => result("offline", 1)),
        isHealthy: async () => false
      },
      makeProvider("whisper", async () => result("whisper", 0.8))
    ])
    const outcome = await chain.transcribe(request)
    expect(outcome.usedProvider).toBe("whisper")
    expect(outcome.fellBack).toBe(true)
    expect(outcome.attempts).toBe(1)
  })

  it("rejects low-quality primary output and falls back", async () => {
    const chain = new ProviderChain(
      [
        makeProvider("gemini", async () => result("gemini", 0.2)),
        makeProvider("whisper", async () => result("whisper", 0.9))
      ],
      { minQualityScore: 0.5 }
    )
    const outcome = await chain.transcribe(request)
    expect(outcome.usedProvider).toBe("whisper")
    expect(outcome.fellBack).toBe(true)
  })

  it("rejects output whose timings exceed the timeout", async () => {
    const chain = new ProviderChain(
      [
        makeProvider("gemini", async () => {
          const now = Date.now()
          return {
            ...result("gemini", 0.9),
            timings: { startedAt: now - 200_000, completedAt: now }
          }
        }),
        makeProvider("whisper", async () => result("whisper", 0.8))
      ],
      { timeoutMs: 1000 }
    )
    const outcome = await chain.transcribe(request)
    expect(outcome.usedProvider).toBe("whisper")
  })

  it("throws when every provider fails", async () => {
    const chain = new ProviderChain([
      makeProvider("gemini", async () => {
        throw new Error("boom")
      })
    ])
    await expect(chain.transcribe(request)).rejects.toThrow("all providers failed")
  })

  it("opens a circuit after repeated failures and still recovers to whisper", async () => {
    const chain = new ProviderChain(
      [
        makeProvider("gemini", async () => {
          throw new Error("gemini down")
        }),
        makeProvider("whisper", async () => result("whisper", 0.8))
      ],
      { failureThreshold: 2 }
    )
    const first = await chain.transcribe(request)
    const second = await chain.transcribe(request)
    expect(first.usedProvider).toBe("whisper")
    expect(second.usedProvider).toBe("whisper")
  })
})
