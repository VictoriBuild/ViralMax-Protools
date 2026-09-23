import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const monorepoRoot = path.join(__dirname, "../..")

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.VERCEL ? undefined : "standalone",
  outputFileTracingRoot: monorepoRoot,
  transpilePackages: ["@repo/shared", "@repo/pipeline", "@repo/ai"],
  allowedDevOrigins: [".monkeycode-ai.live"],
  experimental: {
    serverActions: {
      allowedOrigins: ["*.vercel.app", "*.monkeycode-ai.live"]
    }
  },
  poweredByHeader: false,
  compress: true,
  images: {
    unoptimized: true
  }
}

export default nextConfig
