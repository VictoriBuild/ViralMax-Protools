import { join } from "node:path"
import { existsSync } from "node:fs"
import { app, BrowserWindow } from "electron"
import { registerIpcHandlers } from "./ipc/registry"
import { hardenSession, secureWebContents } from "./security"

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on("ready-to-show", () => mainWindow.show())
  secureWebContents(mainWindow.webContents, process.env.ELECTRON_RENDERER_URL)

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    // Check primary compiled renderer location
    const rendererHtml = join(__dirname, "../renderer/index.html")
    const webOutHtml = join(__dirname, "../../web/out/index.html")

    if (existsSync(rendererHtml)) {
      void mainWindow.loadFile(rendererHtml)
    } else if (existsSync(webOutHtml)) {
      void mainWindow.loadFile(webOutHtml)
    } else {
      // Fallback if app serves web gateway directly
      const webUrl = process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:3000"
      void mainWindow.loadURL(webUrl)
    }
  }

  // Handle failed loads to prevent silent white/black screens
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    console.error(`Failed to load UI (${errorCode}): ${errorDescription}`)
  })
}

app.whenReady().then(async () => {
  hardenSession()
  await registerIpcHandlers()
  createWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})
