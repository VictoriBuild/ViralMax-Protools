import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import type { Engine, StageId, VideoSource } from "@repo/shared"
import { EngineSchema, VideoSourceSchema } from "@repo/shared"

export interface PipelineSnapshot {
  version: 1
  jobId: string
  engine: Engine
  source: VideoSource
  outputs: Partial<Record<StageId, unknown>>
  updatedAt: number
}

export interface SnapshotStore {
  load: (jobId: string) => Promise<PipelineSnapshot | undefined>
  save: (snapshot: PipelineSnapshot) => Promise<void>
  clear: (jobId: string) => Promise<void>
}

export class InMemorySnapshotStore implements SnapshotStore {
  private readonly snapshots = new Map<string, PipelineSnapshot>()

  async load(jobId: string): Promise<PipelineSnapshot | undefined> {
    const snapshot = this.snapshots.get(jobId)
    return snapshot ? { ...snapshot, outputs: { ...snapshot.outputs } } : undefined
  }

  async save(snapshot: PipelineSnapshot): Promise<void> {
    this.snapshots.set(snapshot.jobId, {
      ...snapshot,
      outputs: { ...snapshot.outputs }
    })
  }

  async clear(jobId: string): Promise<void> {
    this.snapshots.delete(jobId)
  }
}

export class JsonFileSnapshotStore implements SnapshotStore {
  constructor(private readonly directory: string) {}

  private filePathFor(jobId: string): string {
    return join(this.directory, `${jobId}.json`)
  }

  async load(jobId: string): Promise<PipelineSnapshot | undefined> {
    const filePath = this.filePathFor(jobId)
    let raw: string
    try {
      raw = await readFile(filePath, "utf8")
    } catch {
      return undefined
    }
    return parseSnapshot(raw)
  }

  async save(snapshot: PipelineSnapshot): Promise<void> {
    const filePath = this.filePathFor(snapshot.jobId)
    const absolute = resolve(filePath)
    await mkdir(dirname(absolute), { recursive: true })
    await writeFile(absolute, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8")
  }

  async clear(jobId: string): Promise<void> {
    const filePath = this.filePathFor(jobId)
    try {
      await rm(filePath)
    } catch {
      // already absent
    }
  }
}

function parseSnapshot(raw: string): PipelineSnapshot | undefined {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (typeof value !== "object" || value === null) {
    return undefined
  }
  const candidate = value as Record<string, unknown>
  if (candidate.version !== 1 || typeof candidate.jobId !== "string") {
    return undefined
  }
  const engine = EngineSchema.safeParse(candidate.engine)
  const source = VideoSourceSchema.safeParse(candidate.source)
  const outputs = candidate.outputs
  if (!engine.success || !source.success) {
    return undefined
  }
  return {
    version: 1,
    jobId: candidate.jobId,
    engine: engine.data,
    source: source.data,
    outputs: isOutputRecord(outputs) ? outputs : {},
    updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : Date.now()
  }
}

function isOutputRecord(value: unknown): value is Partial<Record<StageId, unknown>> {
  return typeof value === "object" && value !== null
}
