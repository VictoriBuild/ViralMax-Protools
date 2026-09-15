import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { PipelineRunner } from "../../engine/runner"
import { createDefaultRegistry } from "../../index"

const SRT = [
  "1",
  "00:00:01,000 --> 00:00:02,000",
  "The reactor core overheated quickly today.",
  "",
  "2",
  "00:00:02,500 --> 00:00:04,000",
  "Engineers contained the reactor core failure fast.",
  "",
  "3",
  "00:00:05,000 --> 00:00:06,000",
  "The reactor core needs cooling."
].join("\n")

describe("full local pipeline end-to-end", () => {
  it("runs acquisition, transcript import, knowledge and editorial offline", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pipeline-e2e-"))
    await mkdir(join(dir, "media"))
    const mediaPath = join(dir, "media", "talk.mp4")
    await writeFile(mediaPath, Buffer.alloc(2048))
    await writeFile(join(dir, "media", "talk.srt"), SRT, "utf8")

    const runner = new PipelineRunner(createDefaultRegistry())
    const result = await runner.run({
      jobId: "11111111-2222-4333-8444-555555555555",
      source: { kind: "local", path: mediaPath },
      engine: "local",
      workspaceDir: join(dir, "workspace")
    })

    expect(result.status).toBe("completed")
    expect(result.plannedStages).toEqual(["acquisition", "transcript_import", "knowledge", "editorial"])
    expect(result.completedStages).toEqual(["acquisition", "transcript_import", "knowledge", "editorial"])
    expect(result.selector).toBe("editorial")
    expect(result.clips).toBeDefined()
    expect(result.clips?.clips.length).toBeGreaterThan(0)
    expect(result.clips?.clips[0]?.headline).toBe("Reactor")
    expect(result.clips?.clips[0]?.endMs).toBeGreaterThan(result.clips?.clips[0]?.startMs ?? -1)

    await rm(dir, { recursive: true, force: true })
  })
})
