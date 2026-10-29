-- ============================================================
-- Make the deny-by-default posture on credential-bearing tables
-- explicit: only the API's own privileged role may reach them.
-- anon and authenticated keep no access at all (no policy granted
-- to them), so this does not widen access for anyone.
-- ============================================================

CREATE POLICY "service_role_full_access"
    ON "public"."users" FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access"
    ON "public"."sessions" FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access"
    ON "public"."password_resets" FOR ALL TO service_role
    USING (true) WITH CHECK (true);