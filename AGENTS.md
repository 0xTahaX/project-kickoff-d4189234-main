# AGENTS.md

Architecture notes for this repository. Read before changing files.

## Rules

- Every Prisma `$transaction` in the data layer must pass an explicit `maxWait` longer than Prisma's default. Why: the API reaches its Supabase region over a wide-area network, and a cold connection can take longer than the default wait, which aborts server startup with "Unable to start a transaction in the given time".
- TLS verification against hosted PostgreSQL requires the CA certificate to be supplied through `DATABASE_SSL_CA_FILE` and the file to live outside the repository. Why: `pg` cannot build a trust chain for the pooler's certificate on its own, and committing a certificate path or file into the repo leaks deployment internals.
- The legacy dashboard writes transactions (with the accounts and category they reference) through the API's `/api/finance` routes, which own all reads/writes scoped by the signed-in user's id; localStorage is only a per-user cache. Why: the server is the single trusted owner check, since the app uses its own session auth rather than Supabase Auth, so RLS on `auth.uid()` never sees these users.
- `apps/api` regenerates the Prisma client before `dev` (`predev`). Why: the generated client is not committed and disappears when the sandbox resets, which crashes the API at startup.
