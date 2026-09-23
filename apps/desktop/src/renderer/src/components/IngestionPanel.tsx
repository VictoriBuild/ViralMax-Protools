import { useState } from "react"
import { Cloud, FolderOpen, HardDrive, Loader2, Play, Upload } from "lucide-react"
import type { Engine, VideoSource } from "@repo/shared"
import { Button } from "@renderer/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@renderer/components/ui/card"
import { Input } from "@renderer/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@renderer/components/ui/tabs"
import { ENGINES } from "@renderer/lib/constants"
import { getDesktopApi } from "@renderer/lib/desktop-api"
import { summarize } from "@renderer/lib/format"
import { cn } from "@renderer/lib/utils"
import { usePipelineStore } from "@renderer/store/usePipelineStore"
import { useSettingsStore } from "@renderer/store/useSettingsStore"

export interface IngestionPanelProps {
  onStarted: () => void
}

type SourceMode = "url" | "local"

export function IngestionPanel({ onStarted }: IngestionPanelProps) {
  const defaultEngine = useSettingsStore((state) => state.settings?.defaultEngine)
  const busy = usePipelineStore((state) => state.busy)
  const start = usePipelineStore((state) => state.start)

  const [engineOverride, setEngineOverride] = useState<Engine | null>(null)
  const [mode, setMode] = useState<SourceMode>("url")
  const [url, setUrl] = useState("")
  const [localPath, setLocalPath] = useState("")
  const [error, setError] = useState<string | null>(null)

  const engine = engineOverride ?? defaultEngine ?? "local"

  const pickFile = async (): Promise<void> => {
    const api = getDesktopApi()
    if (!api) {
      setError("Desktop bridge is unavailable")
      return
    }
    const result = await api.dialogs.selectMedia("Select a video or audio file")
    if (result.ok && result.value.path) {
      setLocalPath(result.value.path)
      setError(null)
    }
  }

  const resolveSource = (): VideoSource | null => {
    if (mode === "url") {
      const trimmed = url.trim()
      if (trimmed.length === 0) {
        setError("Enter a media URL to mine.")
        return null
      }
      try {
        return { kind: "url", url: new URL(trimmed).toString() }
      } catch {
        setError("That URL is not valid. Include the https:// prefix.")
        return null
      }
    }
    if (localPath.trim().length === 0) {
      setError("Choose a local media file to mine.")
      return null
    }
    return { kind: "local", path: localPath.trim() }
  }

  const handleStart = async (): Promise<void> => {
    setError(null)
    const source = resolveSource()
    if (!source) {
      return
    }
    const started = await start(source, engine)
    if (started) {
      onStarted()
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Mine a new clip set</CardTitle>
          <CardDescription>
            Import a URL or a local file, transcribe it, then let the editor surface the strongest moments.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">Processing engine</span>
            <div className="grid grid-cols-2 gap-2">
              {ENGINES.map((option) => {
                const Icon = option.value === "local" ? HardDrive : Cloud
                const selected = engine === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setEngineOverride(option.value)}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors",
                      selected ? "border-primary bg-accent" : "border-border hover:bg-accent/50"
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Icon className="h-4 w-4" />
                      {option.label}
                    </span>
                    <span className="text-xs text-muted-foreground">{option.hint}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <Tabs value={mode} onValueChange={(value) => setMode(value as SourceMode)}>
            <TabsList>
              <TabsTrigger value="url">From URL</TabsTrigger>
              <TabsTrigger value="local">Local file</TabsTrigger>
            </TabsList>
            <TabsContent value="url">
              <div className="flex flex-col gap-2">
                <Input
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void handleStart()
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground">Downloads are routed through yt-dlp on this machine.</p>
              </div>
            </TabsContent>
            <TabsContent value="local">
              <button
                type="button"
                onClick={() => void pickFile()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  void pickFile()
                }}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/30 px-6 py-8 text-center transition-colors hover:bg-accent/40"
              >
                <Upload className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm font-medium">Drag a file here or click to browse</span>
                <span className="text-xs text-muted-foreground">
                  {localPath ? summarize(localPath, 70) : "MP4, MOV, MKV, MP3, WAV and more"}
                </span>
              </button>
              {localPath ? (
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <FolderOpen className="h-3.5 w-3.5" />
                  <span className="truncate">{localPath}</span>
                </div>
              ) : null}
            </TabsContent>
          </Tabs>

          {error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Pipeline stages adapt automatically to captions, speech, and the selected engine.
            </p>
            <Button onClick={() => void handleStart()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Start Mining
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
