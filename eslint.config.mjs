import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const generatedIgnores = ["coverage/**", "dist/**", "node_modules/**", ".tmp/**", "src-tauri/target/**", "*.log"];

export default tseslint.config(
  {
    ignores: generatedIgnores
  },
  {
    files: ["src/**/*.{ts,tsx}", "vite.config.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.browser
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-undef": "off"
    }
  },
  {
    files: ["eslint.config.mjs", "prettier.config.mjs", "scripts/**/*.mjs", "src/core/**/*.mjs", "tests/**/*.mjs"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.es2022
      }
    }
  }
);
