import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // The api's env, for the private app the tests route the dashboard's fetch into (tests/seam.ts).
    env: {
      DATABASE_URL: ":memory:",
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
      BETTER_AUTH_URL: "http://localhost:3000",
      RESEND_API_KEY: "re_test_placeholder",
      LLM_API_KEY: "",
    },
  },
});
