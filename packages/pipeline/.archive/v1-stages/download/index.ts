import type { MediaSource } from "@repo/shared"
import { MediaSourceSchema } from "@repo/shared"
import type { Stage, StageContext } from "../../contract/stage"

type DownloadInput = MediaSource

export interface DownloadOutput {
  mediaPath: string
  title?: string
}

export const downloadStage: Stage<unknown, DownloadInput, DownloadOutput> = {
  id: "download",
  version: "1.0.0",
  execution: "local",
  describe: () => ({
    id: "download",
    version: "1.0.0",
    description: "Download media from a URL using yt-dlp"
  }),
  validate: async (input) => {
    const parsed = MediaSourceSchema.safeParse(input)
    return parsed.success ? { ok: true } : { ok: false, errors: parsed.error.issues.map((e) => e.message) }
  },
  async *run(_ctx: StageContext<unknown>, _input: DownloadInput) {
    yield { type: "started", stage: "download", at: Date.now() }
    throw new Error("downloadStage.run not implemented yet")
  }
}
