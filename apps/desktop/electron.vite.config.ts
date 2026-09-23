import { resolve } from "node:path"
import react from "@vitejs/plugin-react"
import { defineConfig, externalizeDepsPlugin } from "electron-vite"

const workspacePackages = ["@repo/shared", "@repo/pipeline", "@repo/ai"]
const desktopRoot = resolve(__dirname)

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    resolve: {
      alias: {
        "@repo/shared": resolve("../../packages/shared/src/index.ts"),
        "@repo/pipeline": resolve("../../packages/pipeline/src/index.ts"),
        "@repo/ai": resolve("../../packages/ai/src/index.ts")
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    resolve: {
      alias: {
        "@repo/shared": resolve("../../packages/shared/src/index.ts")
      }
    }
  },
  renderer: {
    base: "./",
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
        "@repo/shared": resolve("../../packages/shared/src/index.ts")
      }
    },
    css: {
      postcss: resolve(desktopRoot, "postcss.config.mjs")
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve(desktopRoot, "src/renderer/index.html"),
        output: {
          assetFileNames: "assets/[name]-[hash][extname]",
          chunkFileNames: "assets/[name]-[hash].js",
          entryFileNames: "assets/[name]-[hash].js"
        }
      }
    }
  }
})
