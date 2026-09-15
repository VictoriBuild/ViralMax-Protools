# ADR-0007: Cloud Gemini as Persistent Opt-in Engine Setting

- **Status:** Accepted
- **Date:** 2026-08-31
- **Applies to:** `apps/desktop`

## Context

Cloud transcription via Gemini improves accuracy but sends audio off-device and
incurs per-minute cost. Privacy-sensitive users may prefer to stay local. The
engine choice must be explicit and remembered, yet overridable.

## Decision

- Add a persistent user setting **"Default Engine: Local vs Cloud"** stored in
  the desktop app's durable settings (Main-side store).
- The job setup screen shows a **per-job override toggle** that defaults to the
  saved default engine. The per-job choice does not mutate the persistent
  default.
- When cloud is selected, the app surfaces a one-time privacy disclosure before
  the first cloud job, with a link to the setting to change the default back.

## Consequences

- Respects privacy preferences while keeping Gemini accuracy one toggle away.
- Default engine and per-job override are cleanly separated, avoiding
  accidental persistent changes.
