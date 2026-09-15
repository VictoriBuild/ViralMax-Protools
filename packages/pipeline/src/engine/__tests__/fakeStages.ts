import { join } from "node:path"
import type { Clips, StageId } from "@repo/shared"
import { StageRegistry } from "../../engine/registry"
import type { PipelineStage, StageRuntime } from "../../contract/stage"

export const fakeTranscript = {
  segments: [
    { startMs: 0, endMs: 400, text: "The reactor core overheated quickly today." },
    { startMs: 500, endMs: 900, text: "Engineers contained the reactor core failure fast." },
    { startMs: 1000, endMs: 1400, text: "The reactor core needs cooling." }
  ],
  fullText:
    "The reactor core overheated quickly today. Engineers contained the reactor core failure fast. The reactor core needs cooling."
}

export const fakeKnowledge = {
  topics: [
    { topic: "reactor", mentions: 3 },
    { topic: "core", mentions: 3 }
  ],
  summaries: [{ title: "The reactor core overheated", text: "The reactor core overheated quickly today." }],
  definitions: []
}

export const fakeClips: Clips = {
  clips: [{ startMs: 0, endMs: 900, headline: "Reactor", rationale: "fake sifter output", score: 0.7 }]
}

function defaultOutputFor(stageId: StageId, runtime: StageRuntime<StageId>): unknown {
  switch (stageId) {
    case "acquisition":
      return {
        metadata: { title: "fake source", format: "mp4" },
        audio: { path: join(runtime.workspaceDir, "fake.wav"), mimeType: "audio/wav", sizeBytes: 42 }
      }
    case "transcript_import":
      return { transcript: fakeTranscript, captionsAvailable: true }
    case "speech":
      return { ...fakeTranscript, source: "speech_recognition" }
    case "knowledge":
      return fakeKnowledge
    case "editorial":
    case "local_sifter":
    case "cloud_sifter":
      return fakeClips
  }
}

export interface FakeStageOptions {
  validateOk?: boolean
  onRun?: (runtime: StageRuntime<StageId>, input: unknown) => unknown | Promise<unknown>
  recordRun?: (stageId: StageId) => void
}

export function makeFakeStage<ID extends StageId>(id: ID, options: FakeStageOptions = {}): PipelineStage<ID> {
  const validateOk = options.validateOk ?? true
  return {
    id,
    version: "1.0.0",
    execution: "local",
    description: `fake ${id} stage`,
    validate: async () => (validateOk ? { ok: true } : { ok: false, errors: ["simulated validation failure"] }),
    run: async (runtime, input) => {
      options.recordRun?.(id)
      const output = options.onRun ? await options.onRun(runtime, input) : defaultOutputFor(id, runtime)
      return output as never
    }
  }
}

export function buildFakeRegistry(
  behaviors: Partial<Record<StageId, FakeStageOptions>> = {}
): StageRegistry {
  const stageIds: StageId[] = [
    "acquisition",
    "transcript_import",
    "speech",
    "knowledge",
    "editorial",
    "local_sifter",
    "cloud_sifter"
  ]
  const registry = new StageRegistry()
  for (const stageId of stageIds) {
    registry.register(makeFakeStage(stageId, behaviors[stageId]))
  }
  return registry
}
