import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import type { TranscribeProvider } from "@repo/ai"
import type { Clips, VideoSource } from "@repo/shared"
import { createAcquisitionStage } from "../acquisition"
import { createTranscriptImportStage } from "../transcript_import"
import { createSpeechStage } from "../speech"
import { createKnowledgeStage } from "../knowledge"
import { createEditorialStage } from "../editorial"
import { createLocalSifterStage, type LocalSifterClient } from "../local_sifter"
import { createCloudSifterStage, type CloudSifterClient } from "../cloud_sifter"
import { makeRuntime } from "./fakeRuntime"
import { fakeClips, fakeKnowledge, fakeTranscript } from "../../engine/__tests__/fakeStages"

describe("acquisition stage", () => {
  it("builds metadata and an audio artifact for a local source", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pipeline-acquisition-"))
    const mediaPath = join(dir, "video.mp4")
    await writeFile(mediaPath, Buffer.alloc(1024))

    const source: VideoSource = { kind: "local", path: mediaPath }
    const stage = createAcquisitionStage()
    const runtime = makeRuntime("acquisition", { workspaceDir: dir })
    const output = await stage.run(runtime, source)

    expect(output.metadata.sizeBytes).toBe(1024)
    expect(output.metadata.format).toBe("mp4")
    expect(output.audio.path).toBe(mediaPath)
    expect(output.audio.mimeType).toBe("video/mp4")
    expect(output.source).toEqual(source)
    await rm(dir, { recursive: true, force: true })
  })

  it("fails with a validation error when the local file is missing", async () => {
    const stage = createAcquisitionStage()
    const source: VideoSource = { kind: "local", path: "/does/not/exist.mp4" }
    await expect(stage.run(makeRuntime("acquisition"), source)).rejects.toMatchObject({
      code: "validation",
      retryable: false
    })
  })

  it("fails with a provider error for url sources in v1", async () => {
    const stage = createAcquisitionStage()
    const source: VideoSource = { kind: "url", url: "https://example.com/video.mp4" }
    await expect(stage.run(makeRuntime("acquisition"), source)).rejects.toMatchObject({
      code: "provider_unavailable",
      retryable: true
    })
  })
})

describe("transcript_import stage", () => {
  it("parses an srt caption sidecar into transcript segments", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pipeline-srt-"))
    const mediaPath = join(dir, "video.mp4")
    await writeFile(mediaPath, "x")
    await writeFile(
      join(dir, "video.srt"),
      "1\n00:00:01,000 --> 00:00:02,000\nFirst line here.\n\n2\n00:00:03,250 --> 00:00:04,000\nSecond line here.\n",
      "utf8"
    )
    const source: VideoSource = { kind: "local", path: mediaPath }
    const stage = createTranscriptImportStage()
    const output = await stage.run(makeRuntime("transcript_import"), { video: source })

    expect(output.captionsAvailable).toBe(true)
    expect(output.transcript.source).toBe("platform_captions")
    expect(output.transcript.segments).toHaveLength(2)
    expect(output.transcript.segments[0]).toMatchObject({ startMs: 1000, endMs: 2000, text: "First line here." })
    expect(output.transcript.segments[1]).toMatchObject({ startMs: 3250, endMs: 4000 })
    await rm(dir, { recursive: true, force: true })
  })

  it("fails with provider errors when no sidecar exists or source is a url", async () => {
    const stage = createTranscriptImportStage()
    const localSource: VideoSource = { kind: "local", path: "/no/sidecar/video.mp4" }
    await expect(stage.run(makeRuntime("transcript_import"), { video: localSource })).rejects.toMatchObject({
      code: "provider_unavailable",
      retryable: true
    })
    const urlSource: VideoSource = { kind: "url", url: "https://example.com/video.mp4" }
    await expect(stage.run(makeRuntime("transcript_import"), { video: urlSource })).rejects.toMatchObject({
      code: "provider_unavailable"
    })
  })

  it("fails with a validation error for unparsable captions", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pipeline-srt-bad-"))
    const mediaPath = join(dir, "video.mp4")
    await writeFile(mediaPath, "x")
    await writeFile(join(dir, "video.srt"), "this is not srt\n\n", "utf8")
    const source: VideoSource = { kind: "local", path: mediaPath }
    const stage = createTranscriptImportStage()
    await expect(stage.run(makeRuntime("transcript_import"), { video: source })).rejects.toMatchObject({
      code: "validation"
    })
    await rm(dir, { recursive: true, force: true })
  })
})

describe("speech stage", () => {
  it("fails when no transcription provider is configured", async () => {
    const stage = createSpeechStage()
    const input = { audio: { path: "/tmp/audio.wav" } }
    await expect(stage.run(makeRuntime("speech"), input)).rejects.toMatchObject({
      code: "provider_unavailable",
      retryable: true
    })
  })

  it("delegates to the provider and returns a speech transcript", async () => {
    const calls: string[] = []
    const provider: TranscribeProvider = {
      id: "fake",
      async isHealthy() {
        return true
      },
      async transcribe(request) {
        calls.push(request.audioPath)
        return {
          text: "hello from speech recognition",
          provider: "fake",
          confidence: 0.95,
          qualityScore: 1,
          timings: { startedAt: 1, completedAt: 2 }
        }
      }
    }
    const stage = createSpeechStage({ provider })
    const input = { audio: { path: "/tmp/audio.wav", durationMs: 5000 } }
    const output = await stage.run(makeRuntime("speech"), input)
    expect(calls).toEqual(["/tmp/audio.wav"])
    expect(output.source).toBe("speech_recognition")
    expect(output.fullText).toBe("hello from speech recognition")
    expect(output.segments[0]).toMatchObject({ startMs: 0, endMs: 5000, confidence: 0.95 })
  })

  it("fails the quality gate for empty transcription", async () => {
    const provider: TranscribeProvider = {
      id: "fake",
      async isHealthy() {
        return true
      },
      async transcribe() {
        return { text: "   ", provider: "fake", qualityScore: 0, timings: { startedAt: 1, completedAt: 2 } }
      }
    }
    const stage = createSpeechStage({ provider })
    const input = { audio: { path: "/tmp/audio.wav" } }
    await expect(stage.run(makeRuntime("speech"), input)).rejects.toMatchObject({
      code: "quality_gate",
      retryable: false
    })
  })
})

describe("knowledge and editorial stages", () => {
  it("extracts topics and summaries from a transcript", async () => {
    const stage = createKnowledgeStage()
    const output = await stage.run(makeRuntime("knowledge"), { transcript: fakeTranscript })
    const topics = output.topics.map((topic) => topic.topic)
    expect(topics).toContain("reactor")
    expect(topics).toContain("core")
    expect(output.summaries.length).toBeGreaterThan(0)
  })

  it("selects clips matching knowledge topics", async () => {
    const stage = createEditorialStage()
    const output = await stage.run(makeRuntime("editorial"), {
      transcript: fakeTranscript,
      knowledge: fakeKnowledge
    })
    expect(output.clips.length).toBeGreaterThan(0)
    expect(output.clips[0]).toMatchObject({ startMs: 0, headline: "Reactor" })
    expect(output.clips[0]!.endMs).toBeGreaterThanOrEqual(output.clips[0]!.startMs)
  })

  it("falls back to the longest segment when nothing matches", async () => {
    const stage = createEditorialStage()
    const transcript = {
      segments: [{ startMs: 0, endMs: 100, text: "unrelated content here" }],
      fullText: "unrelated content here"
    }
    const knowledge = { topics: [], summaries: [], definitions: [] }
    const output = await stage.run(makeRuntime("editorial"), { transcript, knowledge })
    expect(output.clips).toHaveLength(1)
  })
})

describe("sifter stages", () => {
  const transcript = fakeTranscript
  const clipsFixture: Clips = fakeClips

  it("local sifter requires a client", async () => {
    const stage = createLocalSifterStage()
    const input = { audio: { path: "/tmp/audio.wav" }, transcript, geminiApiKey: "sk-x" }
    await expect(stage.run(makeRuntime("local_sifter"), input)).rejects.toMatchObject({
      code: "provider_unavailable",
      retryable: true
    })
  })

  it("local sifter delegates to the configured client", async () => {
    const received: unknown[] = []
    const client: LocalSifterClient = {
      async sift(request) {
        received.push(request)
        return clipsFixture
      }
    }
    const stage = createLocalSifterStage({ client })
    const output = await stage.run(makeRuntime("local_sifter"), {
      audio: { path: "/tmp/audio.wav" },
      transcript,
      geminiApiKey: "sk-x"
    })
    expect(output.clips).toEqual(clipsFixture.clips)
    expect(received).toHaveLength(1)
  })

  it("cloud sifter requires a client", async () => {
    const stage = createCloudSifterStage()
    await expect(stage.run(makeRuntime("cloud_sifter", {}, "cloud"), { transcript })).rejects.toMatchObject({
      code: "provider_unavailable"
    })
  })

  it("cloud sifter delegates to the configured client", async () => {
    const received: unknown[] = []
    const client: CloudSifterClient = {
      async sift(request) {
        received.push(request)
        return clipsFixture
      }
    }
    const stage = createCloudSifterStage({ client })
    const output = await stage.run(makeRuntime("cloud_sifter", {}, "cloud"), { transcript })
    expect(output.clips).toEqual(clipsFixture.clips)
    expect(received).toHaveLength(1)
  })
})
