import { useState } from "react"
import { BookOpen, ClipboardCopy, Download, FileText, ScrollText, Sparkles } from "lucide-react"
import type { TranscriptSegment } from "@repo/shared"
import { Badge } from "@renderer/components/ui/badge"
import { Button } from "@renderer/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@renderer/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@renderer/components/ui/tabs"
import { ClipCard } from "@renderer/components/ClipCard"
import { formatDuration, formatSrtTimestamp, formatTimestamp } from "@renderer/lib/format"
import { cn } from "@renderer/lib/utils"
import { usePipelineStore } from "@renderer/store/usePipelineStore"

export interface ResultsViewerProps {
  onStartOver: () => void
}

function buildSrt(segments: TranscriptSegment[]): string {
  return segments
    .map((segment, index) => {
      const text = segment.text.replace(/\s+/g, " ").trim()
      return `${index + 1}\n${formatSrtTimestamp(segment.startMs)} --> ${formatSrtTimestamp(segment.endMs)}\n${text}\n`
    })
    .join("\n")
}

function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function ResultsViewer({ onStartOver }: ResultsViewerProps) {
  const activeJob = usePipelineStore((state) => state.queue.find((job) => job.id === state.activeJobId) ?? null)
  const result = activeJob?.result
  const [tab, setTab] = useState("clips")
  const [selectedIndex, setSelectedIndex] = useState(0)

  if (!activeJob || !result) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
        <Sparkles className="h-6 w-6 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">No results yet</p>
          <p className="text-xs text-muted-foreground">Run a pipeline to generate clips, a transcript, and knowledge notes.</p>
        </div>
        <Button variant="outline" onClick={onStartOver}>
          Start a job
        </Button>
      </div>
    )
  }

  const clips = result.clips.clips
  const transcript = result.transcript
  const knowledge = result.knowledge
  const baseName = (result.metadata?.title ?? "mediasuite-clips").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "mediasuite-clips"

  const copyAllClips = async (): Promise<void> => {
    await navigator.clipboard.writeText(JSON.stringify(result.clips, null, 2))
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <CardTitle>{result.metadata?.title ?? "Mining results"}</CardTitle>
              <CardDescription>
                {activeJob.source.kind === "url" ? activeJob.source.url : activeJob.source.path}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{clips.length} clips</Badge>
              {result.metadata?.durationMs !== undefined ? (
                <Badge variant="outline">{formatDuration(result.metadata.durationMs)}</Badge>
              ) : null}
              <Badge variant="outline">{activeJob.engine} engine</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void copyAllClips()}>
            <ClipboardCopy className="h-3.5 w-3.5" />
            Copy all clips
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => download(`${baseName}-clips.json`, JSON.stringify(result.clips, null, 2), "application/json")}
          >
            <Download className="h-3.5 w-3.5" />
            Download JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!transcript}
            onClick={() => {
              if (transcript) {
                download(`${baseName}-captions.srt`, buildSrt(transcript.segments), "text/plain")
              }
            }}
          >
            <FileText className="h-3.5 w-3.5" />
            Download captions
          </Button>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="clips">
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Clips
            </span>
          </TabsTrigger>
          <TabsTrigger value="transcript">
            <span className="flex items-center gap-1.5">
              <ScrollText className="h-3.5 w-3.5" />
              Transcript
            </span>
          </TabsTrigger>
          {knowledge ? (
            <TabsTrigger value="knowledge">
              <span className="flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5" />
                Knowledge
              </span>
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="clips" className="flex flex-col gap-3">
          {clips.length === 0 ? (
            <p className="text-sm text-muted-foreground">The pipeline completed without producing any clips.</p>
          ) : (
            clips.map((clip, index) => (
              <ClipCard
                key={`${clip.startMs}-${clip.endMs}-${index}`}
                clip={clip}
                index={index}
                transcript={transcript}
                active={selectedIndex === index}
                onSelect={setSelectedIndex}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="transcript">
          {transcript ? (
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {transcript.segments.map((segment, index) => {
                const matchIndex = clips.findIndex(
                  (clip) => clip.endMs > segment.startMs && clip.startMs < segment.endMs
                )
                return (
                  <li key={`${segment.startMs}-${index}`}>
                    <button
                      type="button"
                      onClick={() => {
                        if (matchIndex >= 0) {
                          setSelectedIndex(matchIndex)
                          setTab("clips")
                        }
                      }}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
                        matchIndex >= 0 ? "hover:bg-accent/50" : "cursor-default"
                      )}
                    >
                      <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">
                        {formatTimestamp(segment.startMs)}
                      </span>
                      <span className="min-w-0 flex-1 text-sm">{segment.text}</span>
                      {matchIndex >= 0 ? <Badge variant="outline">Clip {matchIndex + 1}</Badge> : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No transcript was captured for this job.</p>
          )}
        </TabsContent>

        {knowledge ? (
          <TabsContent value="knowledge" className="flex flex-col gap-5">
            {knowledge.summaries.length > 0 ? (
              <section className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold">Summaries</h3>
                {knowledge.summaries.map((summary) => (
                  <Card key={summary.title}>
                    <CardContent className="p-4">
                      <p className="text-sm font-medium">{summary.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{summary.text}</p>
                    </CardContent>
                  </Card>
                ))}
              </section>
            ) : null}
            {knowledge.topics.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">Key topics</h3>
                <div className="flex flex-wrap gap-2">
                  {knowledge.topics.map((topic) => (
                    <Badge key={topic.topic} variant="secondary">
                      {topic.topic}
                      {topic.mentions !== undefined ? ` (${topic.mentions})` : ""}
                    </Badge>
                  ))}
                </div>
              </section>
            ) : null}
            {knowledge.definitions.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">Definitions</h3>
                <ul className="flex flex-col gap-2">
                  {knowledge.definitions.map((definition) => (
                    <li key={definition.term} className="rounded-md border border-border p-3">
                      <span className="text-sm font-medium">{definition.term}</span>
                      <p className="text-sm text-muted-foreground">{definition.definition}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  )
}
