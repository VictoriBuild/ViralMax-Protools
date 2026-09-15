import type { BrowserWindow } from "electron"

const MEDIA_FILTERS = [
  { name: "Media", extensions: ["mp4", "m4v", "mov", "webm", "mkv", "mp3", "m4a", "wav", "ogg", "flac", "aac"] },
  { name: "Video", extensions: ["mp4", "m4v", "mov", "webm", "mkv"] },
  { name: "Audio", extensions: ["mp3", "m4a", "wav", "ogg", "flac", "aac"] }
]

export class DialogService {
  async selectMedia(parent: BrowserWindow | null, title = "Select a video or audio file"): Promise<string | null> {
    const result = await this.showOpen(parent, title, MEDIA_FILTERS, false)
    return result?.[0] ?? null
  }

  async selectDirectory(parent: BrowserWindow | null, title = "Choose an output folder"): Promise<string | null> {
    const result = await this.showOpen(parent, title, [], true)
    return result?.[0] ?? null
  }

  private async showOpen(
    parent: BrowserWindow | null,
    title: string,
    filters: { name: string; extensions: string[] }[],
    directory: boolean
  ): Promise<string[] | null> {
    const { dialog } = await import("electron")
    const options: Electron.OpenDialogOptions = {
      title,
      properties: directory ? ["openDirectory", "createDirectory"] : ["openFile"],
      filters: directory ? undefined : filters
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled) {
      return null
    }
    return result.filePaths
  }
}
