import type { StageId } from "@repo/shared"

export const KEYCHAIN_SERVICE = "com.mediasuite.desktop"
export const KEYCHAIN_GEMINI_ACCOUNT = "gemini"

export const STAGE_ORDER: StageId[] = [
  "acquisition",
  "transcript_import",
  "speech",
  "knowledge",
  "editorial",
  "local_sifter",
  "cloud_sifter"
]

export const STAGE_LABELS: Record<StageId, string> = {
  acquisition: "Acquisition",
  transcript_import: "Caption import",
  speech: "Speech recognition",
  knowledge: "Knowledge extraction",
  editorial: "Editorial analysis",
  local_sifter: "Local sifter",
  cloud_sifter: "Cloud sifter"
}

export const ENGINES = [
  { value: "local", label: "Local", hint: "Runs on this device using local models." },
  { value: "cloud", label: "Cloud", hint: "Uses server credits for the final sift." }
] as const
