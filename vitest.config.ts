import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "hooks/__tests__/**/*.test.{ts,js}",
      "scripts/__tests__/**/*.test.{ts,js}",
    ],
  },
});
