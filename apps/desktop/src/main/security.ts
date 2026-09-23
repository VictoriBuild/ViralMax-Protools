import type { WebContents } from "electron"
import { app, session, shell } from "electron"

function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl)
    return parsed.protocol === "https:" || parsed.protocol === "http:"
  } catch {
    return false
  }
}

function isAllowedNavigation(rawUrl: string, allowedOrigin: string | undefined): boolean {
  if (rawUrl.startsWith("file://")) {
    return true
  }
  if (!allowedOrigin) {
    return false
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

export function applyContentSecurityPolicy(): void {
  const packagedCsp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "media-src 'self' blob: file:",
    "object-src 'none'",
    "base-uri 'none'"
  ].join("; ")

  const devCsp = [
    "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* ws://localhost:*",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:*",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' http://localhost:* ws://localhost:* https:",
    "media-src 'self' blob: file:"
  ].join("; ")

  const csp = app.isPackaged ? packagedCsp : devCsp
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp]
      }
    })
  })
}

export function hardenSession(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })
}
