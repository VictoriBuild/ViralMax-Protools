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
    // Determine production static HTML path
    const rendererPath = join(__dirname, "../renderer/index.html")
    const webOutPath = join(__dirname, "../../web/out/index.html")

    if (existsSync(rendererPath)) {
      void mainWindow.loadFile(rendererPath)
    } else if (existsSync(webOutPath)) {
      void mainWindow.loadFile(webOutPath)
    } else {
      // Fallback: If hosted on web/remote production URL
      const webUrl = process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:3000"
      void mainWindow.loadURL(webUrl)
    }
  }
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
