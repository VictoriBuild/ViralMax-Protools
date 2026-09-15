import { ClipsSchema, KnowledgeSchema } from "@repo/shared"
import type { Knowledge, Transcript } from "@repo/shared"
import { PromptBuilder, transcriptToText, type BuiltPrompt } from "./prompt-builder"

const KNOWLEDGE_SYSTEM = [
  "You are a media knowledge extraction engine.",
  "You analyze video transcripts and produce structured knowledge that downstream stages use to surface viral moments.",
  "Return ONLY valid JSON matching the requested schema. Do not add commentary, markdown, or code fences.",
  "Base every claim strictly on the transcript text. Do not invent speakers, events, or facts absent from the source.",
  "Write summaries in concise, neutral language that an editor can act on."
].join(" ")

const EDITORIAL_SYSTEM = [
  "You are a video virality editor.",
  "You analyze a transcript and its extracted knowledge to identify short moments with high viral potential.",
  "A viral moment has one or more of: a strong emotional hook, a surprising claim, a quotable line, a clear payoff, or a story turn.",
  "Select clips between 15 and 120 seconds long using the timestamps shown in the transcript.",
  "Return ONLY valid JSON matching the requested schema. Do not add commentary, markdown, or code fences.",
  "Every clip must reference real words and timings present in the transcript."
].join(" ")

const SIFTER_SYSTEM = [
  "You are a strict high-confidence clip sifter.",
  "You re-evaluate candidate viral clips against the transcript and keep only those with strong, defensible virality signals.",
  "Reject clips that are out of context, rely on missing audio, overlap redundantly, or whose hook is weak once read plainly.",
  "Prefer a small number of excellent clips over many mediocre ones.",
  "Return ONLY valid JSON matching the requested schema. Do not add commentary, markdown, or code fences.",
  "Every clip you keep must have concrete supporting text in the transcript."
].join(" ")

function transcriptText(transcript: Transcript): string {
  return transcriptToText(transcript)
}

export function buildKnowledgePrompt(transcript: Transcript): BuiltPrompt<typeof KnowledgeSchema> {
  return new PromptBuilder<typeof KnowledgeSchema>({
    name: "knowledge",
    systemInstruction: KNOWLEDGE_SYSTEM,
    schema: KnowledgeSchema
  })
    .section("Transcript", transcriptText(transcript))
    .section("Rules", knowledgeRules())
    .build()
}

export function buildEditorialPrompt(
  transcript: Transcript,
  knowledge: Knowledge
): BuiltPrompt<typeof ClipsSchema> {
  return new PromptBuilder<typeof ClipsSchema>({
    name: "editorial",
    systemInstruction: EDITORIAL_SYSTEM,
    schema: ClipsSchema,
    temperature: 0.4
  })
    .section("Transcript", transcriptText(transcript))
    .section("Extracted knowledge", knowledgeDigest(knowledge))
    .section("Rules", editorialRules())
    .build()
}

export function buildSifterPrompt(
  transcript: Transcript,
  candidates: { startMs: number; endMs: number }[],
  reasoning?: string
): BuiltPrompt<typeof ClipsSchema> {
  const builder = new PromptBuilder<typeof ClipsSchema>({
    name: "sifter",
    systemInstruction: SIFTER_SYSTEM,
    schema: ClipsSchema,
    temperature: 0.2
  })
  builder.section("Transcript", transcriptText(transcript)).section("Candidate clips", candidates)
  if (reasoning) {
    builder.section("Editorial context", reasoning)
  }
  return builder.section("Rules", sifterRules()).build()
}

function knowledgeRules(): string {
  return [
    "Produce at most 8 summaries of 2-4 sentences, ordered by importance.",
    "Each summary must map to concrete transcript content.",
    "List at most 12 key topics. Use a term that appears verbatim when possible.",
    "Define at most 10 domain terms the audience likely needs explained.",
    "Keep all array fields present; empty arrays are allowed."
  ].join("\n")
}

function editorialRules(): string {
  return [
    "Suggest at most 10 clips. More is not better.",
    "Anchor every startMs and endMs to real transcript timestamps; never extrapolate beyond them.",
    "Use the headline field for a compelling, accurate one-line hook.",
    "Score each clip 0.0 to 1.0 for expected virality; be discriminating with high scores."
  ].join("\n")
}

function sifterRules(): string {
  return [
    "Keep at most 5 clips.",
    "Keep startMs and endMs within the transcript range and inside the provided candidate window.",
    "For each kept clip give a headline, a rationale citing the supporting moment, and a virality score 0.0 to 1.0.",
    "Drop clips you cannot defend; empty clips arrays are acceptable."
  ].join("\n")
}

function knowledgeDigest(knowledge: Knowledge): string {
  const summaries = knowledge.summaries.map((s) => `- ${s.title}: ${s.text}`).join("\n")
  const topics = knowledge.topics.map((t) => `- ${t.topic}`).join("\n")
  const definitions = knowledge.definitions.map((d) => `- ${d.term}: ${d.definition}`).join("\n")
  return [
    "Summaries:",
    summaries || "(none)",
    "Key topics:",
    topics || "(none)",
    "Definitions:",
    definitions || "(none)"
  ].join("\n")
}
