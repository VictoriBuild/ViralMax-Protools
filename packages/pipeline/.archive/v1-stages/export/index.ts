import { z } from "zod"
import type { Stage, StageContext } from "../../contract/stage"

const exportInput = z.object({
  transcriptPath: z.string(),
  title: z.string().optional()
})
type ExportInput = z.infer<typeof exportInput>

export interface ExportOutput {
  destination: string
  url?: string
}

export const exportStage: Stage<unknown, ExportInput, ExportOutput> = {
  id: "export",
  version: "1.0.0",
  execution: "cloud",
  describe: () => ({
    id: "export",
    version: "1.0.0",
    description: "Export artifacts to the destination store (R2 or local workspace)"
  }),
  validate: async (input) => {
    const parsed = exportInput.safeParse(input)
    return parsed.success ? { ok: true } : { ok: false, errors: parsed.error.issues.map((e) => e.message) }
  },
  async *run(_ctx: StageContext<unknown>, _input: ExportInput) {
    yield { type: "started", stage: "export", at: Date.now() }
    throw new Error("exportStage.run not implemented yet")
  }
}
