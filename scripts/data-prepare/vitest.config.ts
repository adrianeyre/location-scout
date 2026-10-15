import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Each test prepares data with DuckDB, every Land Coverage Area's land
    // data too, which can take a few seconds while other tests run beside it.
    testTimeout: 30_000,
  },
});
