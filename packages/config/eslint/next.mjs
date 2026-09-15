import globals from "globals"
import tseslint from "typescript-eslint"
import base from "./base.mjs"

export default tseslint.config(
  ...base,
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    }
  }
)
