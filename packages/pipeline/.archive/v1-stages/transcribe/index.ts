import { z } from "zod"
import type { Stage, StageContext } from "../../contract/stage"

const transcribeInput = z.object({
  audioPath: z.string(),
  language: z.string().optional()
})
type TranscribeInput = z.infer<typeof transcribeInput>

export interface TranscribeOutput {
  transcriptPath: string
  language?: string
  provider: string
}

export const transcribeStage: Stage<unknown, TranscribeInput, TranscribeOutput> = {
  id: "transcribe",
  version: "1.0.0",
  execution: "local",
  describe: () => ({
    id: "transcribe",
    version: "1.0.0",
    description: "Transcribe audio using the configured engine (Gemini or whisper.cpp)"
  }),
  validate: async (input) => {
    const parsed = transcribeInput.safeParse(input)
    return parsed.success ? { ok: true } : { ok: false, errors: parsed.error.issues.map((e) => e.message) }
  },
  async *run(_ctx: StageContext<unknown>, _input: TranscribeInput) {
    yield { type: "started", stage: "transcribe", at: Date.now() }
    throw new Error("transcribeStage.run not implemented yet")
  }
}
