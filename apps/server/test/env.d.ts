import type { D1Migration } from "@cloudflare/vitest-plugin";

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      API_KEY: string;
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
