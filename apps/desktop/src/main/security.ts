import type { WebContents } from "electron"
import { session, shell } from "electron"

function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl)
    return parsed.protocol === "https:" || parsed.protocol === "http:"
  } catch {
    return false
  }
}

function isAllowedNavigation(rawUrl: string, allowedOrigin: string | undefined): boolean {
  if (!allowedOrigin) {
    return rawUrl.startsWith("file://")
  }
  const normalized = allowedOrigin.endsWith("/") ? allowedOrigin : `${allowedOrigin}/`
  return rawUrl.startsWith(normalized) || rawUrl === allowedOrigin
}

export function secureWebContents(contents: WebContents, allowedOrigin: string | undefined): void {
  contents.setWindowOpenHandler((details) => {
    if (isSafeExternalUrl(details.url)) {
      void shell.openExternal(details.url)
    }
    return { action: "deny" }
  })

  contents.on("will-navigate", (event, url) => {
    if (!isAllowedNavigation(url, allowedOrigin)) {
      event.preventDefault()
    }
  })
}

export function hardenSession(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })
}
