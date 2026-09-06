import { config as loadEnvironment } from "dotenv";
import { resolve } from "node:path";
import { defineConfig } from "prisma/config";

loadEnvironment({ path: resolve(import.meta.dirname, "../../.env") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://real_estate_app:change-me-local-only@localhost:5432/real_estate?schema=public",
  },
});
