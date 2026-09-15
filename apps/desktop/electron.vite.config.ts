import { resolve } from "node:path"
import react from "@vitejs/plugin-react"
import { defineConfig, externalizeDepsPlugin } from "electron-vite"

const workspacePackages = ["@repo/shared", "@repo/pipeline", "@repo/ai"]

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
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
        "@repo/shared": resolve("../../packages/shared/src/index.ts")
      }
    },
    plugins: [react()]
  }
})
