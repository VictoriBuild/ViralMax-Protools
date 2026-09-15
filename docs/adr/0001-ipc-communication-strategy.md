# ADR-0001: IPC Communication Strategy (Main <-> Renderer)

- **Status:** Accepted
- **Date:** 2026-08-31
- **Applies to:** `apps/desktop`

## Context

The Electron desktop app must expose native capabilities (filesystem, binary
execution, workspace management) to a React renderer. The renderer is a web
surface loading untrusted remote content must be treated as untrusted.

## Decision

- Use `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`
  on every `BrowserWindow`.
- The preload script exposes a typed, namespaced API via
  `contextBridge.exposeInMainWorld("api", ...)`. The renderer never touches
  `ipcRenderer` directly.
- Renderer -> Main traffic uses **only** `ipcRenderer.invoke` / `ipcMain.handle`
  (request/response). Fire-and-forget `send` is prohibited.
- Channel names are compile-time constants defined in
  `packages/shared/src/contracts`. No dynamic or renderer-supplied channel
  names are permitted.
- Every payload is validated with a zod schema on the Main side before dispatch.
- Handlers return a typed `Result<T>` union; exceptions never leak to the
  renderer as raw errors.
- Main -> Renderer events (progress, stage status) use dedicated prefixed
  channels with schema-validated payloads. The renderer subscribes only through
  the preload API.
- Handlers that touch the filesystem or billing verify `webContents.id`.

## Consequences

- Adding a channel requires updating the shared contract and the Main registry,
  making the surface area auditable.
- The renderer remains fully untrusted; compromise of the renderer cannot reach
  Node primitives directly.
