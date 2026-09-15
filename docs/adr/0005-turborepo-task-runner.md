# ADR-0005: Monorepo Task Runner: Turborepo

- **Status:** Accepted
- **Date:** 2026-08-31
- **Applies to:** repository root

## Context

The pnpm monorepo contains multiple apps and packages that need consistent
build, lint, typecheck, and test orchestration with caching.

## Decision

- Use **Turborepo** as the task runner.
- A root-level `turbo.json` defines task pipelines (`build`, `dev`, `lint`,
  `typecheck`, `test`) with dependency ordering and output caching.
- Tasks are declared per-package in each `package.json`; `turbo run <task>`
  at the root drives all packages.
- Cache outputs are scoped to build artifacts (`dist`, `.next`, `.turbo`).

## Consequences

- Deterministic incremental builds across the monorepo.
- A single command (`pnpm dev`, `pnpm build`) runs the full workspace.
