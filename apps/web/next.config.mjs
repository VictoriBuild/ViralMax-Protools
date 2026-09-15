/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@repo/shared", "@repo/pipeline", "@repo/ai"],
  allowedDevOrigins: [".monkeycode-ai.live"]
}

export default nextConfig
