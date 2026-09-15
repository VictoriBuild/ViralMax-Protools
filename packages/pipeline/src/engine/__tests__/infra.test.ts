import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import type { StageId, VideoSource } from "@repo/shared"
import { StageRegistry } from "../registry"
import { createCancellationSignal } from "../cancellation"
import { PipelineRunState } from "../state"
import { InMemorySnapshotStore, JsonFileSnapshotStore } from "../snapshot"
import { buildPlan, captionsExistFor, orderedStages } from "../pathways"
import { makeFakeStage } from "./fakeStages"

describe("StageRegistry", () => {
  it("registers typed stages and rejects duplicates", () => {
    const registry = new StageRegistry()
    registry.register(makeFakeStage("acquisition"))
    registry.register(makeFakeStage("cloud_sifter"))
    expect(registry.has("acquisition")).toBe(true)
    expect(registry.has("knowledge")).toBe(false)
    expect(registry.list()).toHaveLength(2)
    expect(() => registry.register(makeFakeStage("acquisition"))).toThrow(/already registered/)
  })

  it("resolves stages by id and rejects unknown ids", () => {
    const registry = new StageRegistry().register(makeFakeStage("editorial"))
    expect(registry.resolve("editorial").id).toBe("editorial")
    expect(() => registry.resolve("speech")).toThrow(/unknown stage/)
  })
})

describe("createCancellationSignal", () => {
  it("allows cooperative cancellation with a reason", () => {
    const signal = createCancellationSignal()
    expect(signal.aborted).toBe(false)
    signal.requestCancel("stop now")
    expect(signal.aborted).toBe(true)
    expect(signal.reason).toBe("stop now")
    expect(() => signal.throwIfAborted()).toThrow(/stop now/)
  })

  it("mirrors an external abort signal", () => {
    const controller = new AbortController()
    const signal = createCancellationSignal(controller.signal)
    controller.abort("external stop")
    expect(signal.aborted).toBe(true)
    expect(signal.reason).toBe("external stop")
  })

  it("honours a pre-aborted external signal", () => {
    const controller = new AbortController()
    controller.abort()
    const signal = createCancellationSignal(controller.signal)
    expect(signal.aborted).toBe(true)
  })
})

describe("PipelineRunState", () => {
  const source: VideoSource = { kind: "local", path: "/tmp/a.mp4" }

  it("stores and restores typed outputs by stage", () => {
    const state = new PipelineRunState({ jobId: "job-1", source, engine: "local" })
    expect(state.hasOutput("acquisition")).toBe(false)
    state.setOutput("acquisition", { metadata: {}, audio: { path: "/tmp/a.wav" }, source })
    expect(state.hasOutput("acquisition")).toBe(true)
    expect(state.completedStageIds()).toEqual(["acquisition"])
    expect(state.toSnapshotOutputs()).toHaveProperty("acquisition")

    const restored = new PipelineRunState({ jobId: "job-1", source, engine: "local" })
    restored.restoreOutputs(state.toSnapshotOutputs())
    expect(restored.hasOutput("acquisition")).toBe(true)
  })
})

describe("snapshot stores", () => {
  it("round-trips an in-memory snapshot", async () => {
    const store = new InMemorySnapshotStore()
    const snapshot = {
      version: 1 as const,
      jobId: "job-1",
      engine: "local" as const,
      source: { kind: "local" as const, path: "/tmp/a.mp4" },
      outputs: { acquisition: { ok: true } } as Record<StageId, unknown>,
      updatedAt: 123
    }
    await store.save(snapshot)
    const loaded = await store.load("job-1")
    expect(loaded?.jobId).toBe("job-1")
    expect(loaded?.outputs.acquisition).toEqual({ ok: true })
    await store.clear("job-1")
    expect(await store.load("job-1")).toBeUndefined()
  })

  it("round-trips a json file snapshot and ignores corrupt data", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pipeline-snapshots-"))
    const store = new JsonFileSnapshotStore(dir)
    await store.save({
      version: 1,
      jobId: "job-2",
      engine: "cloud",
      source: { kind: "local", path: "/tmp/b.mp4" },
      outputs: {},
      updatedAt: Date.now()
    })
    const loaded = await store.load("job-2")
    expect(loaded?.engine).toBe("cloud")

    await writeFile(join(dir, "corrupt.json"), "not json", "utf8")
    expect(await store.load("corrupt")).toBeUndefined()
    await rm(dir, { recursive: true, force: true })
  })
})

describe("pathway planning", () => {
  const localSource: VideoSource = { kind: "local", path: "/tmp/offline/video.mp4" }

  it("routes a local engine without a gemini key through editorial and knowledge", () => {
    const plan = buildPlan({ engine: "local", source: localSource })
    expect(plan.selector).toBe("editorial")
    expect(plan.includeKnowledge).toBe(true)
    expect(plan.blockers).toEqual([])
  })

  it("routes a local engine with a gemini key through local_sifter", () => {
    const plan = buildPlan({
      engine: "local",
      source: localSource,
      localContext: {
        settings: {
          defaultEngine: "local",
          telemetryEnabled: true,
          workspacePath: null,
          speechProvider: "auto",
          toolPaths: { ytDlp: null, ffmpeg: null, whisperBinary: null, whisperModel: null }
        },
        apiKeys: { geminiApiKey: "sk-test" }
      }
    })
    expect(plan.selector).toBe("local_sifter")
    expect(plan.includeKnowledge).toBe(false)
  })

  it("routes a cloud engine with credits through cloud_sifter", () => {
    const plan = buildPlan({
      engine: "cloud",
      source: localSource,
      cloudContext: { credits: { available: 12, currency: "usd" }, userId: "user-1" }
    })
    expect(plan.selector).toBe("cloud_sifter")
    expect(plan.blockers).toEqual([])
  })

  it("blocks a cloud engine without a credit balance", () => {
    const plan = buildPlan({
      engine: "cloud",
      source: localSource,
      cloudContext: { credits: { available: 0, currency: "usd" }, userId: "user-1" }
    })
    expect(plan.blockers.length).toBeGreaterThan(0)
  })

  it("detects caption sidecars for local media", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pipeline-captions-"))
    await writeFile(join(dir, "video.srt"), "1\n00:00:00,000 --> 00:00:01,000\nHello\n")
    const source: VideoSource = { kind: "local", path: join(dir, "video.mp4") }
    expect(captionsExistFor(source)).toBe(true)
    expect(buildPlan({ engine: "local", source }).transcriptFallback).toBe(false)
    expect(orderedStages(buildPlan({ engine: "local", source }))).toEqual([
      "acquisition",
      "transcript_import",
      "knowledge",
      "editorial"
    ])
    await rm(dir, { recursive: true, force: true })
  })

  it("falls back to speech for sources without captions", () => {
    expect(buildPlan({ engine: "local", source: localSource }).transcriptFallback).toBe(true)
    const sourceUrl: VideoSource = { kind: "url", url: "https://example.com/video.mp4" }
    const plan = buildPlan({ engine: "cloud", source: sourceUrl })
    expect(plan.transcriptFallback).toBe(true)
    expect(orderedStages(plan)).toEqual(["acquisition", "speech", "cloud_sifter"])
  })
})
