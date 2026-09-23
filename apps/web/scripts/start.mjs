import { existsSync } from "node:fs"
import { spawn } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const candidates = [
  join(webRoot, ".next/standalone/apps/web/server.js"),
  join(webRoot, ".next/standalone/server.js")
]
const server = candidates.find((candidate) => existsSync(candidate))

if (!server) {
  console.error("standalone server.js was not found. Run `pnpm --filter web build` first.")
  process.exit(1)
}

const child = spawn(process.execPath, [server], {
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: process.env.PORT ?? "3000",
    HOSTNAME: process.env.HOSTNAME ?? "0.0.0.0"
  }
})

child.on("exit", (code) => process.exit(code ?? 1))
