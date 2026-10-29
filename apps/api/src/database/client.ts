import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { Pool, type PoolConfig } from "pg";
import { secureDatabaseUrl } from "./connection.js";

const DEFAULT_DATABASE_POOL_MAX = 5;

export function databasePoolConfig(
  databaseUrl: string,
  poolMax = DEFAULT_DATABASE_POOL_MAX,
  caCertificate?: string,
): PoolConfig {
  const secureUrl = new URL(secureDatabaseUrl(databaseUrl));
  const hostname = secureUrl.hostname;
  const isSupabase =
    hostname.endsWith(".supabase.com") || hostname.endsWith(".supabase.co");

  const ssl = isSupabase
    ? {
        rejectUnauthorized: true,
        ...(caCertificate ? { ca: caCertificate } : {}),
      }
    : undefined;

  if (isSupabase) {
    for (const parameter of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) {
      secureUrl.searchParams.delete(parameter);
    }
  }

  return {
    connectionString: secureUrl.toString(),
    max: poolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ...(ssl ? { ssl } : {}),
  };
}

export function createDatabaseClient(
  databaseUrl: string,
  poolMax = DEFAULT_DATABASE_POOL_MAX,
  caCertificatePath?: string,
): PrismaClient {
  const secureUrl = secureDatabaseUrl(databaseUrl);
  const hostname = new URL(secureUrl).hostname;
  const isSupabase =
    hostname.endsWith(".supabase.com") || hostname.endsWith(".supabase.co");
  const caCertificate =
    isSupabase && caCertificatePath
      ? readFileSync(caCertificatePath, "utf8")
      : undefined;
  const pool = new Pool(databasePoolConfig(secureUrl, poolMax, caCertificate));
  const adapter = new PrismaPg(pool, {
    disposeExternalPool: true,
    onPoolError: (error) => {
      console.error("PostgreSQL connection pool error:", {
        name: error.name,
      });
    },
  });
  return new PrismaClient({ adapter });
}
