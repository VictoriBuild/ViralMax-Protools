import { useState } from "react"
import { ClipboardCopy, FileText, Film } from "lucide-react"
import type { CandidateClip, Transcript } from "@repo/shared"
import { Badge } from "@renderer/components/ui/badge"
import { Button } from "@renderer/components/ui/button"
import { Card, CardContent } from "@renderer/components/ui/card"
import { formatRange, formatSrtTimestamp } from "@renderer/lib/format"
import { cn } from "@renderer/lib/utils"

export interface ClipCardProps {
  clip: CandidateClip
  index: number
  transcript?: Transcript
  active?: boolean
  onSelect?: (index: number) => void
}

function scoreVariant(score: number | undefined): "success" | "secondary" | "outline" {
  if (score === undefined) {
    return "outline"
  }
  if (score >= 0.75) {
    return "success"
  }
  return score >= 0.5 ? "secondary" : "outline"
}

export function ClipCard({ clip, index, transcript, active, onSelect }: ClipCardProps) {
  const [copied, setCopied] = useState<"metadata" | "captions" | null>(null)

  const segments = transcript?.segments.filter(
    (segment) => segment.endMs > clip.startMs && segment.startMs < clip.endMs
  )

  const clipSrt = (segments ?? [])
    .map((segment, segmentIndex) => {
      const text = segment.text.replace(/\s+/g, " ").trim()
      return `${segmentIndex + 1}\n${formatSrtTimestamp(segment.startMs)} --> ${formatSrtTimestamp(segment.endMs)}\n${text}\n`
    })
    .join("\n")

  const metadata = [
    `Clip ${index + 1}: ${clip.headline}`,
    `Range: ${formatRange(clip.startMs, clip.endMs)}`,
    clip.score !== undefined ? `Score: ${(clip.score * 100).toFixed(0)}%` : null,
    `Rationale: ${clip.rationale}`
  ]
    .filter((line): line is string => line !== null)
    .join("\n")

  const copy = async (kind: "metadata" | "captions", value: string): Promise<void> => {
    if (value.length === 0) {
      return
    }
    await navigator.clipboard.writeText(value)
    setCopied(kind)
    window.setTimeout(() => setCopied(null), 1500)
  }

  return (
    <Card
      className={cn("cursor-pointer transition-shadow", active ? "ring-2 ring-primary" : "hover:shadow-md")}
      onClick={() => onSelect?.(index)}
    >
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold">
              {index + 1}
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold leading-snug">{clip.headline}</p>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Film className="h-3.5 w-3.5" />
                {formatRange(clip.startMs, clip.endMs)}
              </span>
            </div>
          </div>
          {clip.score !== undefined ? (
            <Badge variant={scoreVariant(clip.score)}>{Math.round(clip.score * 100)}%</Badge>
          ) : null}
        </div>

        <p className="text-sm text-muted-foreground">{clip.rationale}</p>

        {segments && segments.length > 0 ? (
          <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/30 p-3">
            {segments.slice(0, 4).map((segment, segmentIndex) => (
              <div key={`${segment.startMs}-${segmentIndex}`} className="flex gap-2 text-xs">
                <span className="shrink-0 font-mono text-muted-foreground">{formatSrtTimestamp(segment.startMs).slice(3, 8)}</span>
                <span className={cn("text-foreground")}>{segment.text}</span>
              </div>
            ))}
            {segments.length > 4 ? (
              <span className="text-xs text-muted-foreground">+{segments.length - 4} more segments</span>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No transcript segments overlap this clip.</p>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={(event) => {
              event.stopPropagation()
              void copy("metadata", metadata)
            }}
          >
            <ClipboardCopy className="h-3.5 w-3.5" />
            {copied === "metadata" ? "Copied" : "Copy metadata"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={clipSrt.length === 0}
            onClick={(event) => {
              event.stopPropagation()
              void copy("captions", clipSrt)
            }}
          >
            <FileText className="h-3.5 w-3.5" />
            {copied === "captions" ? "Copied" : "Copy captions"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
