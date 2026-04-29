import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
    },
  },
  {
    ignores: ["node_modules/", "dist/", "extension/dist/", "build.mjs"],
  }
);
