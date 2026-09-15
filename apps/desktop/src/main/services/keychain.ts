import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { safeStorage } from "electron"

type SecretIndex = Record<string, Record<string, string>>

export class KeychainService {
  constructor(private readonly filePath: string) {}

  isEncryptionAvailable(): boolean {
    try {
      return safeStorage.isEncryptionAvailable()
    } catch {
      return false
    }
  }

  async get(service: string, account: string): Promise<string | null> {
    const index = await this.readIndex()
    const encoded = index[service]?.[account]
    if (!encoded) {
      return null
    }
    return this.decrypt(encoded)
  }

  async set(service: string, account: string, password: string): Promise<void> {
    const index = await this.readIndex()
    const serviceIndex = index[service] ?? {}
    serviceIndex[account] = this.encrypt(password)
    index[service] = serviceIndex
    await this.writeIndex(index)
  }

  async delete(service: string, account: string): Promise<boolean> {
    const index = await this.readIndex()
    const serviceIndex = index[service]
    if (!serviceIndex || !(account in serviceIndex)) {
      return false
    }
    delete serviceIndex[account]
    if (Object.keys(serviceIndex).length === 0) {
      delete index[service]
    }
    await this.writeIndex(index)
    return true
  }

  private ensureEncryptionAvailable(): void {
    if (!this.isEncryptionAvailable()) {
      throw new Error("operating system keychain encryption is unavailable")
    }
  }

  private encrypt(value: string): string {
    this.ensureEncryptionAvailable()
    return safeStorage.encryptString(value).toString("base64")
  }

  private decrypt(encoded: string): string {
    this.ensureEncryptionAvailable()
    return safeStorage.decryptString(Buffer.from(encoded, "base64"))
  }

  private async readIndex(): Promise<SecretIndex> {
    try {
      const raw = await readFile(this.filePath, "utf8")
      const parsed = JSON.parse(raw) as unknown
      if (parsed && typeof parsed === "object") {
        return parsed as SecretIndex
      }
    } catch {
      // corrupt or missing index is treated as empty
    }
    return {}
  }

  private async writeIndex(index: SecretIndex): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, JSON.stringify(index), { encoding: "utf8", mode: 0o600 })
  }
}
