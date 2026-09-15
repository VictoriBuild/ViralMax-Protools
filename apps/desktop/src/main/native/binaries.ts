import { access, constants } from "node:fs/promises"
import { delimiter, dirname, join } from "node:path"
import type { ToolPaths } from "@repo/shared"
import { app } from "electron"

async function isReadable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.R_OK)
    return true
  } catch {
    return false
  }
}

export interface BinaryPaths {
  ytDlp: string | null
  ffmpeg: string | null
  whisperBinary: string | null
  whisperModel: string | null
}

export const TOOL_ENV = {
  ytDlp: "MEDIASUITE_YTDLP_PATH",
  ffmpeg: "MEDIASUITE_FFMPEG_PATH",
  whisperBinary: "MEDIASUITE_WHISPER_PATH",
  whisperModel: "MEDIASUITE_WHISPER_MODEL"
} as const

const EXE_EXTENSION = process.platform === "win32" ? ".exe" : ""

async function isExecutable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.X_OK)
    return true
  } catch {
    return false
  }
}

async function firstExecutable(candidates: readonly string[]): Promise<string | null> {
  for (const candidate of candidates) {
    if (candidate.length === 0) {
      continue
    }
    if (await isExecutable(candidate)) {
      return candidate
    }
  }
  return null
}

async function whichInPath(name: string): Promise<string | null> {
  const pathValue = process.env.PATH
  if (!pathValue) {
    return null
  }
  const entries = pathValue.split(delimiter).filter((entry) => entry.length > 0)
  return firstExecutable(
    entries.flatMap((entry) => [join(entry, name), join(entry, `${name}${EXE_EXTENSION}`)])
  )
}

function candidateNames(base: string): string[] {
  return [`${base}${EXE_EXTENSION}`, base]
}

function packagedCandidates(binDir: string, base: string): string[] {
  return binDir.length === 0 ? [] : candidateNames(base).map((name) => join(binDir, name))
}

function resolveTool(
  envName: string,
  binaryName: string,
  packagedBase: string,
  override?: string | null
): Promise<string | null> {
  const envOverride = process.env[envName]
  const binDir = app.isPackaged ? join(process.resourcesPath, "bin") : ""
  const candidates = [
    ...(override ? [override] : []),
    ...(envOverride ? [envOverride] : []),
    ...packagedCandidates(binDir, packagedBase)
  ]
  return firstExecutable(candidates).then(async (resolved) => resolved ?? whichInPath(binaryName))
}

async function firstModelInDirectory(directory: string): Promise<string | null> {
  const { readdir } = await import("node:fs/promises")
  try {
    const files = await readdir(directory)
    for (const file of files) {
      if (!/^ggml-.*\.bin$/i.test(file)) {
        continue
      }
      const candidate = join(directory, file)
      if (await isReadable(candidate)) {
        return candidate
      }
    }
  } catch {
    // directory is not readable
  }
  return null
}

export async function resolveBinaries(overrides: Partial<ToolPaths> = {}): Promise<BinaryPaths> {
  const ytDlp = await resolveTool(TOOL_ENV.ytDlp, "yt-dlp", "yt-dlp", overrides.ytDlp)
  const ffmpeg = await resolveTool(TOOL_ENV.ffmpeg, "ffmpeg", "ffmpeg", overrides.ffmpeg)

  const packagedBinary = app.isPackaged ? join(process.resourcesPath, "bin") : ""
  const whisperEnv = process.env[TOOL_ENV.whisperBinary]
  const whisperCandidates = [
    ...(overrides.whisperBinary ? [overrides.whisperBinary] : []),
    ...(whisperEnv ? [whisperEnv] : []),
    ...packagedCandidates(packagedBinary, "whisper-cli"),
    ...packagedCandidates(packagedBinary, "whisper")
  ]
  const whisperBinary = await firstExecutable(whisperCandidates).then(
    async (resolved) => resolved ?? whichInPath("whisper-cli")
  )
  if (!whisperBinary) {
    return { ytDlp, ffmpeg, whisperBinary: null, whisperModel: null }
  }

  const modelOverride = overrides.whisperModel
  const modelOverrideReadable = modelOverride ? await isReadable(modelOverride) : false
  const envModel = process.env[TOOL_ENV.whisperModel]
  const envModelReadable = envModel ? await isReadable(envModel) : false
  const packagedModels = app.isPackaged ? join(process.resourcesPath, "models") : ""
  const packagedModel = packagedModels.length > 0 ? await firstModelInDirectory(packagedModels) : null
  const whisperModel = modelOverrideReadable
    ? modelOverride
    : envModel && envModelReadable
      ? envModel
      : ((await firstModelInDirectory(dirname(whisperBinary))) ?? packagedModel)

  if (!whisperModel) {
    return { ytDlp, ffmpeg, whisperBinary: null, whisperModel: null }
  }
  return { ytDlp, ffmpeg, whisperBinary, whisperModel }
}
