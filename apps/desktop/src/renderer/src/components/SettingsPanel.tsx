import { useEffect, useState } from "react"
import { FolderOpen, KeyRound, RefreshCw, Save, Trash2, Wrench } from "lucide-react"
import type { AppSettings, BinaryStatus, SpeechProvider, ToolPaths } from "@repo/shared"
import { Badge } from "@renderer/components/ui/badge"
import { Button } from "@renderer/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@renderer/components/ui/card"
import { Input } from "@renderer/components/ui/input"
import { Switch } from "@renderer/components/ui/switch"
import { useAuthStore } from "@renderer/store/useAuthStore"
import { useSettingsStore } from "@renderer/store/useSettingsStore"

const TOOL_FIELDS: {
  field: keyof ToolPaths
  label: string
  placeholder: string
  detectedKey: keyof BinaryStatus
}[] = [
  { field: "ytDlp", label: "yt-dlp binary", placeholder: "/usr/local/bin/yt-dlp", detectedKey: "ytDlp" },
  { field: "ffmpeg", label: "ffmpeg binary", placeholder: "/usr/local/bin/ffmpeg", detectedKey: "ffmpeg" },
  { field: "whisperBinary", label: "whisper.cpp binary", placeholder: "/opt/whisper/whisper-cli", detectedKey: "whisperBinary" },
  { field: "whisperModel", label: "whisper model", placeholder: "/opt/whisper/models/ggml-base.en.bin", detectedKey: "whisperModel" }
]

export function SettingsPanel() {
  const settings = useSettingsStore((state) => state.settings)
  const binaries = useSettingsStore((state) => state.binaries)
  const geminiKeySet = useSettingsStore((state) => state.geminiKeySet)
  const saving = useSettingsStore((state) => state.saving)
  const error = useSettingsStore((state) => state.error)
  const saveGeminiKey = useSettingsStore((state) => state.saveGeminiKey)
  const clearGeminiKey = useSettingsStore((state) => state.clearGeminiKey)
  const loadBinaries = useSettingsStore((state) => state.loadBinaries)
  const setToolPath = useSettingsStore((state) => state.setToolPath)
  const setSpeechProvider = useSettingsStore((state) => state.setSpeechProvider)
  const setDefaultEngine = useSettingsStore((state) => state.setDefaultEngine)
  const setTelemetry = useSettingsStore((state) => state.setTelemetry)
  const setWorkspacePath = useSettingsStore((state) => state.setWorkspacePath)

  const balance = useAuthStore((state) => state.balance)

  const [keyInput, setKeyInput] = useState("")
  const [keySaved, setKeySaved] = useState(false)

  useEffect(() => {
    void loadBinaries()
  }, [loadBinaries])

  if (!settings) {
    return <p className="text-sm text-muted-foreground">Loading settings...</p>
  }

  const handleSaveKey = async (): Promise<void> => {
    const trimmed = keyInput.trim()
    if (trimmed.length === 0) {
      return
    }
    await saveGeminiKey(trimmed)
    setKeyInput("")
    setKeySaved(true)
    window.setTimeout(() => setKeySaved(false), 1500)
  }

  const chooseWorkspace = async (): Promise<void> => {
    const result = await window.api.dialogs.selectDirectory("Choose a workspace folder")
    if (result.ok && result.value.path) {
      await setWorkspacePath(result.value.path)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            Gemini API key
          </CardTitle>
          <CardDescription>
            Stored in the operating system keychain and only read when a local sift or Gemini transcription runs.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Key status</span>
            <Badge variant={geminiKeySet ? "success" : "outline"}>{geminiKeySet ? "Saved" : "Not set"}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="password"
              autoComplete="off"
              placeholder="AIza..."
              value={keyInput}
              onChange={(event) => setKeyInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleSaveKey()
                }
              }}
            />
            <Button onClick={() => void handleSaveKey()} disabled={keyInput.trim().length === 0}>
              <Save className="h-4 w-4" />
              {keySaved ? "Saved" : "Save"}
            </Button>
            <Button variant="outline" onClick={() => void clearGeminiKey()} disabled={!geminiKeySet}>
              <Trash2 className="h-4 w-4" />
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline defaults</CardTitle>
          <CardDescription>Control how new jobs choose their engine and transcription provider.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <label className="flex items-center justify-between gap-4">
            <span className="flex flex-col">
              <span className="text-sm font-medium">Default engine</span>
              <span className="text-xs text-muted-foreground">Local runs everything on-device.</span>
            </span>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={settings.defaultEngine}
              onChange={(event) => void setDefaultEngine(event.target.value as "local" | "cloud")}
            >
              <option value="local">Local</option>
              <option value="cloud">Cloud</option>
            </select>
          </label>

          {settings.defaultEngine === "cloud" && balance <= 0 ? (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
              Cloud engine requires a positive credit balance. Top up before starting cloud jobs.
            </p>
          ) : null}

          <label className="flex items-center justify-between gap-4">
            <span className="flex flex-col">
              <span className="text-sm font-medium">Speech provider</span>
              <span className="text-xs text-muted-foreground">Auto prefers local whisper, then Gemini.</span>
            </span>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={settings.speechProvider}
              onChange={(event) => void setSpeechProvider(event.target.value as SpeechProvider)}
            >
              <option value="auto">Auto</option>
              <option value="whisper">whisper.cpp</option>
              <option value="gemini">Gemini</option>
            </select>
          </label>

          <div className="flex items-center justify-between gap-4">
            <span className="flex flex-col">
              <span className="text-sm font-medium">Share anonymous telemetry</span>
              <span className="text-xs text-muted-foreground">Helps improve the pipeline quality metrics.</span>
            </span>
            <Switch checked={settings.telemetryEnabled} onCheckedChange={(checked) => void setTelemetry(checked)} />
          </div>

          <div className="flex items-center justify-between gap-4">
            <span className="flex flex-col">
              <span className="text-sm font-medium">Workspace folder</span>
              <span className="truncate text-xs text-muted-foreground">
                {settings.workspacePath ?? "Default application data directory"}
              </span>
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void chooseWorkspace()}>
                <FolderOpen className="h-3.5 w-3.5" />
                Choose
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={settings.workspacePath === null}
                onClick={() => void setWorkspacePath(null)}
              >
                Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <ToolPathsCard
        settings={settings}
        binaries={binaries}
        saving={saving}
        onSetPath={setToolPath}
        onRefresh={loadBinaries}
      />
    </div>
  )
}

interface ToolPathsCardProps {
  settings: AppSettings
  binaries: BinaryStatus | null
  saving: boolean
  onSetPath: (field: keyof ToolPaths, path: string | null) => Promise<void>
  onRefresh: () => Promise<void>
}

function ToolPathsCard({ settings, binaries, saving, onSetPath, onRefresh }: ToolPathsCardProps) {
  const [paths, setPaths] = useState<Record<keyof ToolPaths, string>>(() => ({
    ytDlp: settings.toolPaths.ytDlp ?? "",
    ffmpeg: settings.toolPaths.ffmpeg ?? "",
    whisperBinary: settings.toolPaths.whisperBinary ?? "",
    whisperModel: settings.toolPaths.whisperModel ?? ""
  }))

  const commitPath = async (field: keyof ToolPaths): Promise<void> => {
    const current = settings.toolPaths[field]
    const draft = paths[field].trim()
    const nextValue = draft.length > 0 ? draft : null
    if (nextValue !== current) {
      await onSetPath(field, nextValue)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              Tool paths
            </CardTitle>
            <CardDescription>Override the binaries used by yt-dlp, ffmpeg, and whisper.cpp.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void onRefresh()}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {TOOL_FIELDS.map(({ field, label, placeholder, detectedKey }) => {
          const detected = binaries ? binaries[detectedKey] : null
          return (
            <div key={field} className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{label}</span>
              <Input
                placeholder={placeholder}
                value={paths[field]}
                onChange={(event) => setPaths((previous) => ({ ...previous, [field]: event.target.value }))}
                onBlur={() => void commitPath(field)}
              />
              <span className="text-xs text-muted-foreground">
                {detected ? `Detected: ${detected}` : "Not detected on PATH or in resources."}
              </span>
            </div>
          )
        })}
        {saving ? <span className="text-xs text-muted-foreground">Saving...</span> : null}
      </CardContent>
    </Card>
  )
}
