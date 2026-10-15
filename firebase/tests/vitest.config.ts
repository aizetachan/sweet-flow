import { defineConfig } from "vitest/config";

// All suites share one emulator instance: run files one after another.
export default defineConfig({
  test: {
    include: ["*.test.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
