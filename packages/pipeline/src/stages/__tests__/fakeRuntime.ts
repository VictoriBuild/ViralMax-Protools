import type { Engine, StageId } from "@repo/shared"
import type { StageRuntime } from "../../contract/stage"
import { createCancellationSignal } from "../../engine/cancellation"

export function makeRuntime<ID extends StageId>(
  stageId: ID,
  overrides: Partial<StageRuntime<ID>> = {},
  engine: Engine = "local"
): StageRuntime<ID> {
  const base: StageRuntime<ID> = {
    jobId: "job-test",
    stageId,
    engine,
    signal: createCancellationSignal(),
    workspaceDir: "/tmp/pipeline",
    tempDir: "/tmp/pipeline/tmp",
    reportProgress: () => {},
    trackArtifact: () => {},
    untrackArtifact: () => {},
    ...overrides
  }
  return base
}
