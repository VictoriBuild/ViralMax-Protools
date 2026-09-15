# Architecture Decision Records

This directory records key architectural decisions for the project. Each ADR is
immutable once accepted; superseded decisions are marked as such with a pointer
to their replacement.

| ADR | Title | Status |
|-----|-------|--------|
| [0001](./0001-ipc-communication-strategy.md) | IPC Communication Strategy (Main <-> Renderer) | Accepted |
| [0002](./0002-local-vs-cloud-processing.md) | Local vs. Cloud Processing & Security Boundaries | Accepted |
| [0003](./0003-pipeline-stage-contract.md) | Pipeline Plugin Stage Contract | Accepted |
| [0004](./0004-transcription-fallback.md) | Transcription Fallback Strategy (Gemini API -> whisper.cpp) | Accepted |
| [0005](./0005-turborepo-task-runner.md) | Monorepo Task Runner: Turborepo | Accepted |
| [0006](./0006-whispercpp-cpu-only-v1.md) | whisper.cpp CPU-only for v1 | Accepted |
| [0007](./0007-gemini-engine-setting.md) | Cloud Gemini as Persistent Opt-in Engine Setting | Accepted |

See the [architecture overview](../architecture/README.md) for the full context.
