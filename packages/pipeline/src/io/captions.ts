import { existsSync } from "node:fs"
import { dirname, extname, join } from "node:path"
import type { VideoSource } from "@repo/shared"

export const SIDECAR_EXTENSIONS = [".srt", ".vtt", ".json"] as const

export function captionsFileFor(source: VideoSource): string | undefined {
  if (source.kind === "url") {
    return undefined
  }
  const extension = extname(source.path)
  const dir = dirname(source.path)
  const base = source.path.slice(dir.length + 1, -extension.length)
  for (const sidecarExtension of SIDECAR_EXTENSIONS) {
    const sidecar = join(dir, `${base}${sidecarExtension}`)
    if (existsSync(sidecar)) {
      return sidecar
    }
  }
  return undefined
}

export function captionsExistFor(source: VideoSource): boolean {
  return captionsFileFor(source) !== undefined
}
