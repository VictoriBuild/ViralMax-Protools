import { existsSync } from "node:fs"
import { dirname, extname, join } from "node:path"
import type { CloudContext, Engine, LocalContext, StageId, VideoSource } from "@repo/shared"

export type SelectorStageId = "editorial" | "local_sifter" | "cloud_sifter"

/** transcripts are produced either from captions or by local speech recognition */
export type TranscriptStageId = "transcript_import" | "speech"

export interface PathwayRequest {
  engine: Engine
  source: VideoSource
  localContext?: LocalContext
  cloudContext?: CloudContext
}

export interface PipelinePlan {
  engine: Engine
  source: VideoSource
  /** when true the transcript is produced by `speech`, otherwise by `transcript_import` */
  transcriptFallback: boolean
  /** final clip-producing stage */
  selector: SelectorStageId
  /** knowledge extraction runs before an editorial selector */
  includeKnowledge: boolean
  /** unresolved hard requirements that prevent this plan from running */
  blockers: string[]
}

const SIDECAR_EXTENSIONS = [".srt", ".vtt", ".json"]

export function captionsExistFor(source: VideoSource): boolean {
  if (source.kind === "url") {
    return false
  }
  const { dir, base } = splitPath(source.path)
  return SIDECAR_EXTENSIONS.some((extension) => {
    const sidecar = join(dir, `${base}${extension}`)
    return existsSync(sidecar)
  })
}

function splitPath(filePath: string): { dir: string; base: string } {
  const extension = extname(filePath)
  const dir = dirname(filePath)
  const base = filePath.slice(dir.length + 1, -extension.length)
  return { dir, base }
}

export function buildPlan(request: PathwayRequest): PipelinePlan {
  const blockers: string[] = []
  const captionsExist = captionsExistFor(request.source)
  let selector: SelectorStageId
  let includeKnowledge = false

  if (request.engine === "cloud") {
    selector = "cloud_sifter"
    const credits = request.cloudContext?.credits.available ?? 0
    if (credits <= 0) {
      blockers.push("cloud engine requires a positive cloud credit balance")
    }
  } else {
    const geminiKey = request.localContext?.apiKeys.geminiApiKey
    if (geminiKey) {
      selector = "local_sifter"
    } else {
      selector = "editorial"
      includeKnowledge = true
    }
  }

  return {
    engine: request.engine,
    source: request.source,
    transcriptFallback: !captionsExist,
    selector,
    includeKnowledge,
    blockers
  }
}

export function transcriptStageFor(plan: PipelinePlan): TranscriptStageId {
  return plan.transcriptFallback ? "speech" : "transcript_import"
}

export function orderedStages(plan: PipelinePlan): StageId[] {
  const stages: StageId[] = ["acquisition", transcriptStageFor(plan)]
  if (plan.includeKnowledge) {
    stages.push("knowledge")
  }
  stages.push(plan.selector)
  return stages
}
