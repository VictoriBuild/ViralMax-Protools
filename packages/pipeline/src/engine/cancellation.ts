import type { CancellationSignal } from "@repo/shared"

export function createCancellationSignal(external?: AbortSignal): CancellationSignal {
  const controller = new AbortController()

  if (external) {
    if (external.aborted) {
      controller.abort(external.reason)
    } else {
      external.addEventListener("abort", () => controller.abort(external.reason), { once: true })
    }
  }

  const signal: CancellationSignal = {
    get aborted() {
      return controller.signal.aborted
    },
    get reason() {
      const reason = controller.signal.reason
      return reason instanceof Error ? reason.message : String(reason ?? "")
    },
    signal: controller.signal,
    requestCancel(reason?: string) {
      controller.abort(reason ?? "cancelled")
    },
    throwIfAborted() {
      if (controller.signal.aborted) {
        const reason = controller.signal.reason
        throw new Error(reason instanceof Error ? reason.message : String(reason ?? "cancelled"))
      }
    }
  }

  return signal
}
