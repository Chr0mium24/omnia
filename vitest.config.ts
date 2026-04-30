import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["server/**/*.ts", "extension/src/**/*.ts"],
    },
    environmentMatchGlobs: [
      ["tests/extension-popup.test.ts", "happy-dom"],
    ],
  },
});
