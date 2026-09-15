export interface TranscriptionRequest {
  audioPath: string
  language?: string
  options?: Record<string, unknown>
}

export interface TranscriptionTimings {
  startedAt: number
  completedAt: number
}

export interface TranscriptionSegment {
  startMs: number
  endMs: number
  text: string
  confidence?: number
}

export interface TranscriptionResult {
  text: string
  provider: string
  confidence?: number
  qualityScore: number
  timings: TranscriptionTimings
  language?: string
  segments?: TranscriptionSegment[]
}

export interface TranscribeProvider {
  readonly id: string
  isHealthy: () => Promise<boolean>
  transcribe: (request: TranscriptionRequest) => Promise<TranscriptionResult>
}
