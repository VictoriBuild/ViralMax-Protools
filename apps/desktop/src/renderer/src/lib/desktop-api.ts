import type { DesktopApi } from "../../../preload/index"

export function getDesktopApi(): DesktopApi | undefined {
  if (typeof window === "undefined") {
    return undefined
  }
  return window.api
}
