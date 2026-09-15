import type { CandidateClip, EditorialInput, EditorialOutput } from "@repo/shared"
import { EditorialInputSchema } from "@repo/shared"
import type { PipelineStage } from "../../contract/stage"
import { validateAgainst } from "../helpers"

function topicTerms(input: EditorialInput): string[] {
  const terms = new Set<string>()
  for (const topic of input.knowledge.topics) {
    terms.add(topic.topic.toLowerCase())
  }
  for (const definition of input.knowledge.definitions) {
    terms.add(definition.term.toLowerCase())
  }
  return [...terms]
}

function titleCase(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1)
}

export function createEditorialStage(): PipelineStage<"editorial"> {
  return {
    id: "editorial",
    version: "1.0.0",
    execution: "local",
    description: "Selects candidate clips from a transcript using extracted knowledge",
    validate: validateAgainst(EditorialInputSchema),
    async run(runtime, input: EditorialInput) {
      runtime.signal.throwIfAborted()
      runtime.reportProgress(15, "indexing topics")

      const terms = topicTerms(input)
      const segments = input.transcript.segments
      const clips: CandidateClip[] = []

      let runStart = -1
      let runEnd = -1
      const runTopics = new Set<string>()

      const flushRun = (): void => {
        if (runStart < 0 || runEnd < 0) {
          return
        }
        const topics = [...runTopics]
        const firstTopic = topics[0] ?? "Highlight"
        const rationale =
          topics.length > 0
            ? `Covers ${topics.length} topic(s): ${topics.join(", ")}`
            : "Longest passage selected from the transcript"
        clips.push({
          startMs: segments[runStart]?.startMs ?? 0,
          endMs: segments[runEnd]?.endMs ?? 0,
          headline: titleCase(firstTopic),
          rationale,
          score: Math.min(1, runTopics.size / Math.max(1, input.knowledge.topics.length || 1))
        })
        runStart = -1
        runEnd = -1
        runTopics.clear()
      }

      runtime.reportProgress(40, "scanning transcript")
      for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index] ?? { text: "" }
        const matched = terms.filter((term) => segment.text.toLowerCase().includes(term))
        if (matched.length === 0) {
          flushRun()
          continue
        }
        if (runStart < 0) {
          runStart = index
        }
        runEnd = index
        for (const term of matched) {
          runTopics.add(term)
        }
      }
      flushRun()

      if (clips.length === 0) {
        const longest = segments.reduce((best, segment) =>
          segment.text.length > best.text.length ? segment : best
        )
        clips.push({
          startMs: longest.startMs,
          endMs: longest.endMs,
          headline: titleCase(longest.text.trim().split(/\s+/).slice(0, 6).join(" ")),
          rationale: "Fallback selection of the longest segment",
          score: 0.1
        })
      }

      runtime.signal.throwIfAborted()
      runtime.reportProgress(100, "editorial selection complete")
      const output: EditorialOutput = { clips }
      return output
    }
  }
}

export const editorialStage = createEditorialStage()
