/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: { unoptimized: true },
  transpilePackages: ["@repo/shared", "@repo/pipeline", "@repo/ai"],
  allowedDevOrigins: [".monkeycode-ai.live"]
}

export default nextConfig
