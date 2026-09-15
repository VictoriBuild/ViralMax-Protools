# ADR-0002: Local vs. Cloud Processing & Security Boundaries

- **Status:** Accepted
- **Date:** 2026-08-31
- **Applies to:** `apps/desktop`, `apps/web`, `supabase`

## Context

The product mixes local processing (yt-dlp, FFmpeg, whisper.cpp) with cloud
services (Supabase, Gemini API, Paystack, Resend, PostHog, Cloudflare R2).
Backend secrets must never ship inside the desktop app bundle.

## Decision

- **Local-first execution.** The desktop app runs the pipeline locally
  (yt-dlp -> FFmpeg -> whisper.cpp) and stores artifacts in a user workspace.
- The desktop app **never holds** Supabase service-role keys, R2 secret keys,
  Gemini API keys, the Paystack secret, or the Resend key.
- The cloud (Next.js API routes + Supabase Edge Functions) is the **single
  authority** for: authentication, the credit ledger, payments (Paystack),
  entitlements, cloud transcription fallback, and R2 presigned URLs.
- The desktop authenticates with a **user-scoped Supabase session** (anon +
  user JWT). Anything requiring secrets goes through the web gateway
  (`/api/*`), which returns short-lived, scoped artifacts (presigned URLs,
  signed entitlement tokens).
- Private media stays on-device unless the user explicitly opts into cloud
  processing.

## Consequences

- A fully compromised desktop app leaks only the user's own session, never
  backend credentials.
- Local processing preserves privacy and reduces cloud costs.
