import { cpSync, existsSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const nestedStandalone = join(webRoot, ".next/standalone/apps/web")
const flatStandalone = join(webRoot, ".next/standalone")
const dest = existsSync(nestedStandalone) ? nestedStandalone : flatStandalone

if (!existsSync(dest)) {
  console.warn("standalone output was not found; skip copying static assets")
  process.exit(0)
}

const publicDir = join(webRoot, "public")
if (existsSync(publicDir)) {
  cpSync(publicDir, join(dest, "public"), { recursive: true })
}

const staticDir = join(webRoot, ".next/static")
if (existsSync(staticDir)) {
  mkdirSync(join(dest, ".next"), { recursive: true })
  cpSync(staticDir, join(dest, ".next/static"), { recursive: true })
}

console.log(`standalone assets copied into ${dest}`)
