import type { KnowledgeInput, KnowledgeOutput, Transcript } from "@repo/shared"
import { KnowledgeInputSchema } from "@repo/shared"
import type { PipelineStage } from "../../contract/stage"
import { validateAgainst } from "../helpers"

const STOP_WORDS = new Set([
  "the", "and", "that", "this", "with", "from", "have", "has", "had", "was", "were", "are", "for", "not",
  "you", "your", "our", "they", "them", "their", "but", "can", "will", "would", "could", "should", "about",
  "into", "over", "than", "then", "just", "like", "because", "what", "when", "where", "which", "there", "here"
])

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z][a-z0-9'-]{2,}/g) ?? []
}

function fullTextOf(transcript: Transcript): string {
  return transcript.fullText ?? transcript.segments.map((segment) => segment.text).join(" ")
}

function countWords(texts: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const text of texts) {
    for (const word of tokenize(text)) {
      if (STOP_WORDS.has(word)) {
        continue
      }
      counts.set(word, (counts.get(word) ?? 0) + 1)
    }
  }
  return counts
}

function topTopics(counts: Map<string, number>, limit: number): { topic: string; mentions: number }[] {
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([topic, mentions]) => ({ topic, mentions }))
}

function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
}

function buildSummaries(transcript: Transcript, limit: number): { title: string; text: string }[] {
  const text = fullTextOf(transcript)
  const sentences = sentencesOf(text)
  if (sentences.length === 0) {
    return []
  }
  const summaries: { title: string; text: string }[] = []
  const chunkSize = Math.max(1, Math.ceil(sentences.length / limit))
  for (let index = 0; index < sentences.length; index += chunkSize) {
    const chunk = sentences.slice(index, index + chunkSize)
    const body = chunk.join(" ")
    const titleSource = chunk[0] ?? body
    summaries.push({
      title: titleSource.length > 60 ? `${titleSource.slice(0, 57)}...` : titleSource,
      text: body.length > 400 ? `${body.slice(0, 397)}...` : body
    })
    if (summaries.length >= limit) {
      break
    }
  }
  return summaries
}

function buildDefinitions(transcript: Transcript, limit: number): { term: string; definition: string }[] {
  const definitions: { term: string; definition: string }[] = []
  for (const sentence of sentencesOf(fullTextOf(transcript))) {
    const marker = sentence.match(/^(?:[A-Za-z][A-Za-z0-9'_-]+)\s+(?:is|means|refers to)\s+(?:a|an|the|to)?\s*/)
    if (!marker) {
      continue
    }
    const term = (marker[0] ?? "").trim().split(/\s+/)[0] ?? ""
    const definition = sentence.replace(/^[^.!?]*?(?=\b(?:is|means|refers to)\b)/, "").trim()
    if (term.length > 0 && definition.length > 0 && !definitions.some((entry) => entry.term === term)) {
      definitions.push({ term, definition: definition.replace(/\.$/, "") })
    }
    if (definitions.length >= limit) {
      break
    }
  }
  return definitions
}

export function createKnowledgeStage(): PipelineStage<"knowledge"> {
  return {
    id: "knowledge",
    version: "1.0.0",
    execution: "local",
    description: "Extracts structural knowledge (topics, summaries, definitions) from a transcript",
    validate: validateAgainst(KnowledgeInputSchema),
    async run(runtime, input: KnowledgeInput) {
      runtime.signal.throwIfAborted()
      runtime.reportProgress(20, "analyzing transcript")
      const segmentTexts = input.transcript.segments.map((segment) => segment.text)
      const counts = countWords(segmentTexts)
      const output: KnowledgeOutput = {
        topics: topTopics(counts, 6),
        summaries: buildSummaries(input.transcript, 3),
        definitions: buildDefinitions(input.transcript, 4)
      }
      runtime.signal.throwIfAborted()
      runtime.reportProgress(100, "knowledge extracted")
      return output
    }
  }
}

export const knowledgeStage = createKnowledgeStage()
