import { access, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import type { StageId } from "@repo/shared"
import { StageExecutionError } from "../../contract/errors"
import type { PipelinePlan } from "../pathways"
import { PipelineRunner } from "../runner"
import { InMemorySnapshotStore } from "../snapshot"
import { buildFakeRegistry, fakeClips, fakeTranscript } from "./fakeStages"
import type { RunPipelineRequest } from "../runner"

const localSource = { kind: "local" as const, path: "/media/video.mp4" }

function captionsEditorialPlan(): PipelinePlan {
  return {
    engine: "local",
    source: localSource,
    transcriptFallback: false,
    selector: "editorial",
    includeKnowledge: true,
    blockers: []
  }
}

function speechCloudSifterPlan(engine: "local" | "cloud"): PipelinePlan {
  return {
    engine,
    source: localSource,
    transcriptFallback: true,
    selector: "cloud_sifter",
    includeKnowledge: false,
    blockers: []
  }
}

function request(overrides: Partial<RunPipelineRequest> = {}): RunPipelineRequest {
  return {
    jobId: "6f6f1e0b-5f3c-4d1a-8d9e-3f1b2c3d4e5f",
    source: localSource,
    engine: "local",
    plan: captionsEditorialPlan(),
    ...overrides
  }
}

describe("PipelineRunner sequential execution", () => {
  it("executes stages in plan order and returns selector clips", async () => {
    const order: StageId[] = []
    const recorder = buildFakeRegistry({
      acquisition: { recordRun: (id) => order.push(id) },
      transcript_import: { recordRun: (id) => order.push(id) },
      knowledge: { recordRun: (id) => order.push(id) },
      editorial: { recordRun: (id) => order.push(id) }
    })

    const runner = new PipelineRunner(recorder)
    const result = await runner.run(request())

    expect(result.status).toBe("completed")
    expect(result.plannedStages).toEqual(["acquisition", "transcript_import", "knowledge", "editorial"])
    expect(order).toEqual(["acquisition", "transcript_import", "knowledge", "editorial"])
    expect(result.completedStages).toEqual(["acquisition", "transcript_import", "knowledge", "editorial"])
    expect(result.clips).toBeDefined()
    expect(result.clips?.clips.length).toBeGreaterThan(0)
  })

  it("streams progress across stage transitions", async () => {
    const progress: { stageId: StageId; percent: number; message?: string }[] = []
    const runner = new PipelineRunner(buildFakeRegistry(), {
      onProgress: (event) => progress.push(event)
    })
    await runner.run(request())

    const stages = new Set(progress.map((entry) => entry.stageId))
    expect([...stages].sort()).toEqual(["acquisition", "editorial", "knowledge", "transcript_import"])
    const started = progress.filter((entry) => entry.message === "stage started")
    const completed = progress.filter((entry) => entry.message === "stage completed")
    expect(started).toHaveLength(4)
    expect(completed).toHaveLength(4)
    for (const entry of progress) {
      expect(entry.percent).toBeGreaterThanOrEqual(0)
      expect(entry.percent).toBeLessThanOrEqual(100)
    }
  })

  it("streams in-flight progress reported by a stage", async () => {
    const progress: number[] = []
    const runner = new PipelineRunner(
      buildFakeRegistry({
        transcript_import: {
          onRun: async (runtime) => {
            runtime.reportProgress(50, "halfway there")
            return { transcript: fakeTranscript, captionsAvailable: true }
          }
        }
      }),
      { onProgress: (event) => progress.push(event.percent) }
    )
    await runner.run(request())
    expect(progress).toContain(50)
  })

  it("runs the cloud pathway when a cloud plan is supplied", async () => {
    const order: StageId[] = []
    const runner = new PipelineRunner(
      buildFakeRegistry({
        acquisition: { recordRun: (id) => order.push(id) },
        speech: { recordRun: (id) => order.push(id) },
        cloud_sifter: { recordRun: (id) => order.push(id) }
      })
    )
    const result = await runner.run(request({ engine: "cloud", plan: speechCloudSifterPlan("cloud") }))
    expect(result.status).toBe("completed")
    expect(order).toEqual(["acquisition", "speech", "cloud_sifter"])
    expect(result.selector).toBe("cloud_sifter")
  })
})

describe("PipelineRunner cancellation", () => {
  it("cancels cleanly and cleans up tracked artifacts when aborted mid-stage", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pipeline-cancel-"))
    const artifactFile = join(dir, "partial.bin")
    await writeFile(artifactFile, "partial")

    const controller = new AbortController()
    const runner = new PipelineRunner(
      buildFakeRegistry({
        speech: {
          onRun: async (runtime) => {
            runtime.trackArtifact(artifactFile)
            await new Promise<void>((resolveAbort) => {
              runtime.signal.signal.addEventListener("abort", () => resolveAbort(), { once: true })
            })
            runtime.signal.throwIfAborted()
            return fakeTranscript
          }
        }
      })
    )

    const runPromise = runner.run(
      request({ plan: speechCloudSifterPlan("local"), signal: controller.signal, workspaceDir: dir })
    )
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 5))
    controller.abort("user requested cancellation")
    const result = await runPromise

    expect(result.status).toBe("cancelled")
    expect(result.currentStage).toBe("speech")
    expect(result.completedStages).toEqual(["acquisition"])
    await expect(access(artifactFile)).rejects.toThrow()
    await rm(dir, { recursive: true, force: true })
  })

  it("returns cancelled for an already-aborted external signal", async () => {
    const controller = new AbortController()
    controller.abort("cancelled before start")
    const runner = new PipelineRunner(buildFakeRegistry())
    const result = await runner.run(request({ signal: controller.signal }))
    expect(result.status).toBe("cancelled")
    expect(result.completedStages).toEqual([])
  })

  it("cancels when a stage reports a cancelled error", async () => {
    const runner = new PipelineRunner(
      buildFakeRegistry({
        knowledge: {
          onRun: () => {
            throw new StageExecutionError({
              stageId: "knowledge",
              code: "cancelled",
              message: "cancelled internally",
              retryable: false
            })
          }
        }
      })
    )
    const result = await runner.run(request())
    expect(result.status).toBe("cancelled")
    expect(result.currentStage).toBe("knowledge")
  })
})

describe("PipelineRunner error recovery", () => {
  it("retries retryable failures then succeeds", async () => {
    let attempts = 0
    const runner = new PipelineRunner(
      buildFakeRegistry({
        speech: {
          onRun: async (runtime) => {
            attempts += 1
            if (attempts === 1) {
              throw new StageExecutionError({
                stageId: "speech",
                code: "provider_unavailable",
                message: "transient provider failure",
                retryable: true
              })
            }
            runtime.reportProgress(100, "ok")
            return fakeTranscript
          }
        }
      }),
      { retryDelaysMs: [0] }
    )
    const result = await runner.run(request({ plan: speechCloudSifterPlan("local") }))
    expect(result.status).toBe("completed")
    expect(attempts).toBe(2)
  })

  it("fails fast when the error is not retryable", async () => {
    let attempts = 0
    const runner = new PipelineRunner(
      buildFakeRegistry({
        speech: {
          onRun: () => {
            attempts += 1
            throw new StageExecutionError({
              stageId: "speech",
              code: "provider_unavailable",
              message: "permanent provider failure",
              retryable: false
            })
          }
        }
      }),
      { retryDelaysMs: [0, 5] }
    )
    const result = await runner.run(request({ plan: speechCloudSifterPlan("local") }))
    expect(result.status).toBe("failed")
    expect(attempts).toBe(1)
    expect(result.error?.code).toBe("provider_unavailable")
    expect(result.currentStage).toBe("speech")
  })

  it("reports a structured validation error when a stage rejects its input", async () => {
    const runner = new PipelineRunner(
      buildFakeRegistry({
        knowledge: { validateOk: false }
      })
    )
    const result = await runner.run(request())
    expect(result.status).toBe("failed")
    expect(result.currentStage).toBe("knowledge")
    expect(result.error?.code).toBe("validation")
    expect(result.error?.message).toContain("simulated validation failure")
    expect(result.completedStages).toEqual(["acquisition", "transcript_import"])
  })
})

describe("PipelineRunner blockers and resume", () => {
  it("refuses to start a cloud run without cloud credits", async () => {
    const runner = new PipelineRunner(buildFakeRegistry())
    const result = await runner.run(
      request({ engine: "cloud", plan: undefined, cloudContext: { credits: { available: 0, currency: "usd" }, userId: "u1" } })
    )
    expect(result.status).toBe("failed")
    expect(result.error?.code).toBe("validation")
    expect(result.error?.message).toContain("credit")
  })

  it("resumes from the last completed stage after an interruption", async () => {
    const store = new InMemorySnapshotStore()
    const failing = new PipelineRunner(
      buildFakeRegistry({
        transcript_import: {
          onRun: () => {
            throw new StageExecutionError({
              stageId: "transcript_import",
              code: "validation",
              message: "captions missing",
              retryable: false
            })
          }
        }
      }),
      { store }
    )
    const first = await failing.run(request())
    expect(first.status).toBe("failed")
    expect(first.completedStages).toEqual(["acquisition"])

    const healthy = new PipelineRunner(buildFakeRegistry(), { store })
    const resumed = await healthy.run(request({ resume: true }))
    expect(resumed.status).toBe("completed")
    expect(resumed.resumed).toBe(true)
    expect(resumed.completedStages).toEqual(["acquisition", "transcript_import", "knowledge", "editorial"])
    expect(resumed.clips).toEqual(fakeClips)
  })
})
