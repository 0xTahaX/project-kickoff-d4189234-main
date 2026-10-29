import { readConfig } from "../config/env.js";
import { createDatabaseClient } from "./client.js";

async function checkConnection(): Promise<void> {
  const config = readConfig();
  const prisma = createDatabaseClient(
    config.databaseUrl,
    config.databasePoolMax,
    config.databaseSslCaFile,
  );
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT NOW()`;
    console.info("PostgreSQL connection and SELECT NOW() succeeded.");
  } finally {
    await prisma.$disconnect();
  }
}

checkConnection().catch((error: unknown) => {
  console.error("PostgreSQL connection check failed:", {
    name: error instanceof Error ? error.name : "UnknownError",
    message:
      error instanceof Error
        ? error.message.replace(/(postgres(?:ql)?:\/\/)[^@\s]+@/gi, "$1[redacted]@")
        : "Check DATABASE_URL and network access.",
  });
  process.exitCode = 1;
});
