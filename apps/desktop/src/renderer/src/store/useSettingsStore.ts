import { create } from "zustand"
import type { AppSettings, AppSettingsPatch, BinaryStatus, Engine, SpeechProvider, ToolPaths } from "@repo/shared"
import { KEYCHAIN_GEMINI_ACCOUNT, KEYCHAIN_SERVICE } from "@renderer/lib/constants"

interface SettingsState {
  settings: AppSettings | null
  binaries: BinaryStatus | null
  geminiKeySet: boolean
  loading: boolean
  saving: boolean
  error: string | null
  load: () => Promise<void>
  update: (patch: AppSettingsPatch) => Promise<void>
  saveGeminiKey: (key: string) => Promise<void>
  clearGeminiKey: () => Promise<void>
  loadBinaries: () => Promise<void>
  setToolPath: (field: keyof ToolPaths, path: string | null) => Promise<void>
  setSpeechProvider: (provider: SpeechProvider) => Promise<void>
  setDefaultEngine: (engine: Engine) => Promise<void>
  setTelemetry: (enabled: boolean) => Promise<void>
  setWorkspacePath: (path: string | null) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  binaries: null,
  geminiKeySet: false,
  loading: false,
  saving: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null })
    try {
      const [settingsResult, keyResult] = await Promise.all([
        window.api.settings.get(),
        window.api.keychain.get(KEYCHAIN_SERVICE, KEYCHAIN_GEMINI_ACCOUNT)
      ])
      set({
        settings: settingsResult.ok ? settingsResult.value : get().settings,
        geminiKeySet: keyResult.ok ? keyResult.value.password !== null : false,
        error: settingsResult.ok ? null : settingsResult.message
      })
    } finally {
      set({ loading: false })
    }
  },

  update: async (patch) => {
    set({ saving: true, error: null })
    const result = await window.api.settings.set(patch)
    if (result.ok) {
      set({ settings: result.value })
    } else {
      set({ error: result.message })
    }
    set({ saving: false })
  },

  saveGeminiKey: async (key) => {
    const result = await window.api.keychain.set(KEYCHAIN_SERVICE, KEYCHAIN_GEMINI_ACCOUNT, key)
    if (result.ok) {
      set({ geminiKeySet: key.length > 0, error: null })
    } else {
      set({ error: result.message })
    }
  },

  clearGeminiKey: async () => {
    const result = await window.api.keychain.delete(KEYCHAIN_SERVICE, KEYCHAIN_GEMINI_ACCOUNT)
    if (result.ok) {
      set({ geminiKeySet: false, error: null })
    } else {
      set({ error: result.message })
    }
  },

  loadBinaries: async () => {
    const result = await window.api.tools.status()
    if (result.ok) {
      set({ binaries: result.value })
    } else {
      set({ error: result.message })
    }
  },

  setToolPath: async (field, path) => {
    const current = get().settings
    if (!current) {
      return
    }
    await get().update({ toolPaths: { ...current.toolPaths, [field]: path } })
    await get().loadBinaries()
  },

  setSpeechProvider: async (provider) => {
    await get().update({ speechProvider: provider })
  },

  setDefaultEngine: async (engine) => {
    await get().update({ defaultEngine: engine })
  },

  setTelemetry: async (enabled) => {
    await get().update({ telemetryEnabled: enabled })
  },

  setWorkspacePath: async (path) => {
    await get().update({ workspacePath: path })
  }
}))
