# ADR-0004: Transcription Fallback Strategy (Gemini API -> whisper.cpp)

- **Status:** Accepted
- **Date:** 2026-08-31
- **Applies to:** `packages/ai`, `packages/pipeline`

## Context

Transcription can run either via the cloud Gemini API or locally with
whisper.cpp. Cloud offers higher accuracy; local offers privacy, offline
operation, and zero per-minute cost. A single provider must not be a point of
failure.

## Decision

- Introduce a `TranscribeProvider` interface and a **provider chain** ordered
  **Gemini API (primary) -> whisper.cpp (local fallback)**.
- Fallback triggers: HTTP 4xx/5xx, quota/rate-limit exhaustion, timeout budget
  exceeded, empty or very-low-confidence transcript, or a transcript quality
  gate below threshold.
- Each provider exposes `isHealthy()`, `transcribe(audio, opts)`, and returns a
  quality score plus timing metadata.
- A **circuit breaker** (per provider, sliding window) prevents hammering a
  failing provider.
- Users choose the default engine (ADR-0007); per-job override is allowed.
  Privacy-sensitive or offline jobs may select local as primary.

## Consequences

- Users get Gemini accuracy by default with a private offline fallback path.
- The engine choice is a runtime decision, not a code path change.
