# ADR-0006: whisper.cpp CPU-only for v1

- **Status:** Accepted
- **Date:** 2026-08-31
- **Applies to:** `packages/pipeline`, `apps/desktop`

## Context

whisper.cpp supports multiple acceleration backends (CPU, Metal on macOS,
CUDA/Vulkan on NVIDIA). Cross-platform packaging complexity grows with each
backend due to per-platform binaries and runtime detection.

## Decision

- **v1 ships CPU-only** whisper.cpp builds for all platforms.
- The `TranscribeProvider` interface is backend-agnostic; acceleration is
  selected at build/runtime configuration, never baked into the contract.
- GPU/Metal acceleration is deferred to v2 and will be additive (new provider
  option), requiring no engine changes.

## Consequences

- Simple, uniform cross-platform packaging and testing for v1.
- Some transcripts (large audio, long jobs) will be slower than GPU-accelerated
  runs; acceptable for v1 scope.
