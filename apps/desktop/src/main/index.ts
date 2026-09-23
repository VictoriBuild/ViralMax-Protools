import { existsSync } from "node:fs"
import { join } from "node:path"
import { app, BrowserWindow } from "electron"
import { registerIpcHandlers } from "./ipc/registry"
import { applyContentSecurityPolicy, hardenSession, secureWebContents } from "./security"

function resolveRendererHtml(): string | null {
  const candidates = [
    join(__dirname, "../renderer/index.html"),
    join(app.getAppPath(), "out/renderer/index.html"),
    join(process.resourcesPath, "app.asar/out/renderer/index.html"),
    join(process.resourcesPath, "app/out/renderer/index.html")
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#09090b",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  })

  const reveal = (): void => {
    if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show()
    }
  }
  mainWindow.once("ready-to-show", reveal)
  setTimeout(reveal, 1500)

  const devServerUrl = process.env.ELECTRON_RENDERER_URL
  secureWebContents(mainWindow.webContents, devServerUrl)

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`Failed to load UI (${errorCode}): ${errorDescription} url=${validatedURL}`)
  })

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error(`Renderer process gone: ${details.reason}`)
  })

  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl)
    return
  }

  const rendererHtml = resolveRendererHtml()
  if (!rendererHtml) {
    console.error("Packaged renderer index.html was not found")
    void mainWindow.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent("<h1>ViralMax failed to locate UI assets</h1><p>out/renderer/index.html is missing.</p>")
    )
    return
  }

  void mainWindow.loadFile(rendererHtml)
}

app.whenReady().then(async () => {
  if (process.platform === "win32") {
    app.setAppUserModelId("com.viralmax.protools")
  }
  applyContentSecurityPolicy()
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
