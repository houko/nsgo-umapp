import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: { API_KEY: "test-key", TEST_MIGRATIONS: await readD1Migrations("./migrations") },
      },
    })),
  ],
  test: { setupFiles: ["./test/setup.ts"] },
});
