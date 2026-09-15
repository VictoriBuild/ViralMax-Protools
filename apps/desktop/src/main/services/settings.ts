import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { AppSettings, AppSettingsPatch } from "@repo/shared"
import { AppSettingsSchema, DEFAULT_TOOL_PATHS } from "@repo/shared"

const DEFAULT_SETTINGS: AppSettings = {
  defaultEngine: "local",
  telemetryEnabled: true,
  workspacePath: null,
  speechProvider: "auto",
  toolPaths: DEFAULT_TOOL_PATHS
}

export class SettingsStore {
  private cache: AppSettings | null = null

  constructor(private readonly filePath: string) {}

  async get(): Promise<AppSettings> {
    if (this.cache) {
      return this.cache
    }
    let stored: unknown = null
    try {
      const raw = await readFile(this.filePath, "utf8")
      stored = JSON.parse(raw) as unknown
    } catch {
      // missing or corrupt settings fall back to defaults
    }
    const parsed = AppSettingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...(asRecord(stored) ?? {}) })
    this.cache = parsed.success ? parsed.data : DEFAULT_SETTINGS
    return this.cache
  }

  async patch(patch: AppSettingsPatch): Promise<AppSettings> {
    const current = await this.get()
    const merged = AppSettingsSchema.parse({ ...current, ...patch })
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, JSON.stringify(merged, null, 2), { encoding: "utf8", mode: 0o600 })
    this.cache = merged
    return merged
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}
