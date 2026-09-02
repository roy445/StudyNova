import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const parsed = loadEnv({ path: ".env" }).parsed ?? {};

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? parsed.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/app_db",
      SESSION_SECRET: process.env.SESSION_SECRET ?? parsed.SESSION_SECRET ?? "test-session-secret",
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
