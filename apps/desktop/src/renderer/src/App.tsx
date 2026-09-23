import { useEffect, useState } from "react"
import { AppShell } from "@renderer/components/AppShell"
import type { ViewId } from "@renderer/components/AppShell"
import { ErrorBoundary } from "@renderer/components/ErrorBoundary"
import { IngestionPanel } from "@renderer/components/IngestionPanel"
import { PipelineMonitor } from "@renderer/components/PipelineMonitor"
import { ResultsViewer } from "@renderer/components/ResultsViewer"
import { SettingsPanel } from "@renderer/components/SettingsPanel"
import { getDesktopApi } from "@renderer/lib/desktop-api"
import { useAuthStore } from "@renderer/store/useAuthStore"
import { usePipelineStore } from "@renderer/store/usePipelineStore"
import { useSettingsStore } from "@renderer/store/useSettingsStore"

export default function App() {
  const [view, setView] = useState<ViewId>("ingest")
  const bindEvents = usePipelineStore((state) => state.bindEvents)
  const loadSettings = useSettingsStore((state) => state.load)
  const refreshAuth = useAuthStore((state) => state.refresh)

  useEffect(() => {
    if (!getDesktopApi()) {
      return
    }
    void loadSettings()
    void refreshAuth()
    return bindEvents()
  }, [bindEvents, loadSettings, refreshAuth])

  return (
    <ErrorBoundary>
      <AppShell view={view} onViewChange={setView}>
        {view === "ingest" ? <IngestionPanel onStarted={() => setView("monitor")} /> : null}
        {view === "monitor" ? <PipelineMonitor onViewResults={() => setView("results")} /> : null}
        {view === "results" ? <ResultsViewer onStartOver={() => setView("ingest")} /> : null}
        {view === "settings" ? <SettingsPanel /> : null}
      </AppShell>
    </ErrorBoundary>
  )
}
