import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["server/**/*.ts", "extension/src/**/*.ts"],
    },
    environmentMatchGlobs: [
      ["tests/extension-popup.test.ts", "happy-dom"],
    ],
  },
  esbuild: {
    target: "es2022",
  },
});