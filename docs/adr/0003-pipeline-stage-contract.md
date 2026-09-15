# ADR-0003: Pipeline Plugin Stage Contract

- **Status:** Accepted
- **Date:** 2026-08-31
- **Applies to:** `packages/pipeline`

## Context

The media pipeline (download -> extract -> transcribe -> export) must be
composable, testable in isolation, and extensible with new stages (e.g., new AI
backends, new export targets) without touching the engine.

## Decision

A pipeline is an ordered graph of stages. Every stage implements a stable
contract:

```ts
interface Stage<C, I, O> {
  id: string
  version: string
  execution: "local" | "cloud"          // declared execution environment
  describe(ctx: StageContext<C>): StageMeta
  validate(input: unknown): Promise<ValidationResult>
  run(ctx: StageContext<C>, input: I): AsyncIterable<StageEvent<O>>
}
```

- Stages are pure about IO: they declare input/output zod schemas and emit
  typed lifecycle events (`started`, `progress`, `artifacts`, `failed`).
- A stage receives a scoped `StageContext` (workspace dirs, cancellation token,
  allowed tool handles) and never touches global state.
- A `Registry` resolves stage versions by id; the `Engine` orchestrates
  execution, cancellation, retries, and persistence of stage state so a job can
  resume after an interruption.
- `execution: "cloud"` stages are invoked through the web gateway by the
  engine, keeping secret-bearing work server-side.

## Consequences

- Stages are drop-in packages; adding a stage requires no engine changes.
- Stages can be unit-tested with a stub context and composed identically in
  server-side and client-side pipelines.
