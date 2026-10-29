import { defineConfig } from "prisma/config";
import { securePrismaDatabaseUrl } from "./src/database/connection.js";

if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = securePrismaDatabaseUrl(
    process.env.DATABASE_URL,
    process.env.DATABASE_SSL_CA_FILE?.trim() || undefined,
  );
}

// A safe local fallback allows client generation before PostgreSQL is provisioned.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url:
      process.env.DATABASE_URL ||
      "postgresql://dara:dara@localhost:5432/dara?schema=public",
  },
});
