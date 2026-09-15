import reactHooks from "eslint-plugin-react-hooks"
import globals from "globals"
import tseslint from "typescript-eslint"
import base from "./base.mjs"

export default tseslint.config(
  ...base,
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      globals: {
        ...globals.browser
      }
    }
  },
  {
    plugins: {
      "react-hooks": reactHooks
    },
    rules: reactHooks.configs.flat.recommended.rules
  }
)
