import { z } from "zod"
import type { Stage, StageContext } from "../../contract/stage"

const extractInput = z.object({
  mediaPath: z.string()
})
type ExtractInput = z.infer<typeof extractInput>

export interface ExtractOutput {
  audioPath: string
  durationMs: number
}

export const extractStage: Stage<unknown, ExtractInput, ExtractOutput> = {
  id: "extract",
  version: "1.0.0",
  execution: "local",
  describe: () => ({
    id: "extract",
    version: "1.0.0",
    description: "Extract audio from media using FFmpeg"
  }),
  validate: async (input) => {
    const parsed = extractInput.safeParse(input)
    return parsed.success ? { ok: true } : { ok: false, errors: parsed.error.issues.map((e) => e.message) }
  },
  async *run(_ctx: StageContext<unknown>, _input: ExtractInput) {
    yield { type: "started", stage: "extract", at: Date.now() }
    throw new Error("extractStage.run not implemented yet")
  }
}
