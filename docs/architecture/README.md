# Architecture Overview

This document captures the approved high-level architecture for the project.
See [ADRs](../adr/) for individual decisions.

## Stack

Electron + React + TypeScript + Tailwind CSS + shadcn/ui + Zustand (desktop),
Next.js (web), Supabase, Gemini API, Paystack, Resend, PostHog, Cloudflare R2,
yt-dlp, FFmpeg, whisper.cpp, pnpm + Turborepo monorepo.

## Directory Tree

```
/workspace
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
├── turbo.json
├── .env.example
├── apps/
│   ├── desktop/                    # Electron app
│   │   ├── electron/
│   │   │   ├── main/
│   │   │   │   ├── index.ts        # BrowserWindow, app lifecycle
│   │   │   │   ├── ipc/
│   │   │   │   │   ├── registry.ts # typed channel registration
│   │   │   │   │   └── handlers/   # per-domain handlers
│   │   │   │   └── services/       # binary mgmt, queue, updates
│   │   │   ├── preload/
│   │   │   │   └── index.ts        # contextBridge API surface
│   │   │   └── main.ts
│   │   ├── src/                    # React renderer
│   │   │   ├── app/                # routes, providers
│   │   │   ├── components/         # shadcn/ui components
│   │   │   ├── features/           # downloader, transcription, billing
│   │   │   ├── stores/             # Zustand stores
│   │   │   ├── hooks/
│   │   │   └── lib/                # client-side utils
│   │   ├── resources/              # icons, native assets
│   │   ├── electron.vite.config.ts
│   │   ├── tailwind.config.ts
│   │   └── package.json
│   └── web/                        # Next.js app
│       ├── app/                    # App Router pages
│       │   ├── (marketing)/
│       │   ├── (auth)/             # sign-in, sign-up
│       │   ├── (dashboard)/        # credits, settings, usage
│       │   └── api/                # gateway route handlers
│       ├── components/
│       ├── lib/
│       ├── next.config.mjs
│       └── package.json
├── packages/
│   ├── pipeline/                   # pipeline engine + stages
│   │   ├── src/
│   │   │   ├── engine/
│   │   │   ├── stages/
│   │   │   │   ├── download/       # yt-dlp stage
│   │   │   │   ├── extract/        # FFmpeg stage
│   │   │   │   ├── transcribe/     # whisper.cpp / Gemini stage
│   │   │   │   └── export/         # R2 upload, format out
│   │   │   ├── contract/           # Stage interface + schemas
│   │   │   └── index.ts
│   │   └── package.json
│   ├── ai/                         # Gemini client, provider chain
│   │   ├── src/
│   │   │   ├── client.ts
│   │   │   ├── providers/          # GeminiProvider, WhisperProvider
│   │   │   ├── fallback.ts         # circuit breaker, quality gate
│   │   │   └── index.ts
│   │   └── package.json
│   ├── shared/                     # types, zod schemas, IPC contract
│   │   ├── src/
│   │   │   ├── contracts/          # IPC channels + payload types
│   │   │   ├── schemas/            # zod validation
│   │   │   ├── types/
│   │   │   └── index.ts
│   │   └── package.json
│   └── config/                     # shared tooling presets
│       ├── eslint/
│       ├── tsconfig/
│       ├── tailwind/
│       └── package.json
└── supabase/
    ├── config.toml
    ├── migrations/
    ├── functions/                  # Edge Functions
    │   ├── billing/                # Paystack webhook, credit ledger
    │   ├── auth/                   # JWT issuance, entitlements
    │   ├── transcribe/             # cloud transcription fallback
    │   └── uploads/                # R2 signed uploads
    ├── seed.sql
    └── types/
```

## Security Boundaries

- **Desktop (untrusted surface, zero secrets):** yt-dlp, FFmpeg, whisper.cpp,
  workspace IO, pipeline orchestration.
- **Cloud (secrets holder, single authority):** Supabase auth + ledger, Paystack,
  Resend, Gemini key, R2 credentials, cloud transcription fallback.
- Desktop talks to cloud only as a user-scoped session via the web gateway;
  entitlements and uploads use short-lived signed artifacts.

## Approved Decisions (2026-08-31)

1. **Gemini opt-in:** persistent "Default Engine: Local vs Cloud" setting with a
   per-job override toggle (ADR-0007).
2. **whisper.cpp:** CPU-only for v1; GPU/Metal deferred to v2 (ADR-0006).
3. **Task runner:** Turborepo with root `turbo.json` (ADR-0005).
4. **ADRs persisted** in `docs/adr/` as Markdown.
