import { describe, expect, it } from "vitest";
import { databasePoolConfig } from "./client.js";
import {
  secureDatabaseUrl,
  securePrismaDatabaseUrl,
} from "./connection.js";

describe("PostgreSQL connection configuration", () => {
  it("requires verified TLS for Supabase endpoints", () => {
    const url = secureDatabaseUrl(
      "postgresql://test-user:test-password@aws-0-example.pooler.supabase.com:5432/postgres?sslmode=require",
    );

    expect(new URL(url).searchParams.get("sslmode")).toBe("verify-full");
  });

  it("uses a bounded pool and verifies the Supabase certificate", () => {
    const config = databasePoolConfig(
      "postgresql://test-user:test-password@aws-0-example.pooler.supabase.com:5432/postgres",
    );

    expect(config.max).toBe(5);
    expect(config.idleTimeoutMillis).toBe(30_000);
    expect(config.connectionTimeoutMillis).toBe(10_000);
    expect(config.ssl).toEqual({ rejectUnauthorized: true });
    expect(new URL(config.connectionString as string).searchParams.has("sslmode")).toBe(
      false,
    );
  });

  it("uses an explicitly supplied Supabase CA without weakening TLS verification", () => {
    const config = databasePoolConfig(
      "postgresql://user:password@aws-0-example.pooler.supabase.com:5432/postgres?sslmode=require",
      5,
      "test CA certificate",
    );

    expect(config.ssl).toEqual({
      rejectUnauthorized: true,
      ca: "test CA certificate",
    });
    expect(new URL(config.connectionString as string).searchParams.has("sslmode")).toBe(
      false,
    );
  });

  it("configures Prisma CLI to require TLS and strictly verify Supabase certificates", () => {
    const url = securePrismaDatabaseUrl(
      "postgresql://user:password@aws-0-example.pooler.supabase.com:5432/postgres",
      "C:\\certs\\supabase-ca.crt",
    );
    const parsedUrl = new URL(url);

    expect(parsedUrl.searchParams.get("sslmode")).toBe("require");
    expect(parsedUrl.searchParams.get("sslaccept")).toBe("strict");
    expect(parsedUrl.searchParams.get("sslcert")).toBe("C:\\certs\\supabase-ca.crt");
  });

  it("allows deployments to cap connections per API process", () => {
    const config = databasePoolConfig(
      "postgresql://test-user:test-password@localhost:5432/dara",
      2,
    );

    expect(config.max).toBe(2);
  });

  it("does not force Supabase TLS settings on local PostgreSQL", () => {
    const config = databasePoolConfig(
      "postgresql://test-user:test-password@localhost:5432/dara",
    );

    expect(config.ssl).toBeUndefined();
    expect(new URL(config.connectionString as string).searchParams.has("sslmode")).toBe(false);
  });

  it("rejects malformed or non-PostgreSQL URLs without exposing them", () => {
    expect(() => secureDatabaseUrl("not-a-url")).toThrow(/آدرس معتبر PostgreSQL/);
    expect(() => secureDatabaseUrl("https://example.test/")).toThrow(/PostgreSQL/);
  });
});
