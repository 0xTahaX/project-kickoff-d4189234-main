export function secureDatabaseUrl(databaseUrl: string): string {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL باید یک آدرس معتبر PostgreSQL باشد.");
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL باید به PostgreSQL اشاره کند.");
  }

  const isSupabase =
    url.hostname.endsWith(".supabase.com") || url.hostname.endsWith(".supabase.co");
  if (isSupabase) {
    url.searchParams.set("sslmode", "verify-full");
  }

  return url.toString();
}

export function securePrismaDatabaseUrl(
  databaseUrl: string,
  caCertificatePath?: string,
): string {
  const url = new URL(secureDatabaseUrl(databaseUrl));
  const isSupabase =
    url.hostname.endsWith(".supabase.com") || url.hostname.endsWith(".supabase.co");

  if (isSupabase) {
    url.searchParams.set("sslmode", "require");
    url.searchParams.set("sslaccept", "strict");
    if (caCertificatePath) {
      url.searchParams.set("sslcert", caCertificatePath);
    }
  }

  return url.toString();
}
