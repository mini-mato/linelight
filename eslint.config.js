import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default [
  { ignores: ["dist", "node_modules", "coverage", ".pnpm-store"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];
