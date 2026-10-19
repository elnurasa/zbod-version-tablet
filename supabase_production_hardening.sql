-- ═══════════════════════════════════════════════════════════════════
-- ZBOD TOOL — İstifadəyə hazırlıq (production hardening)
--
-- Supabase → SQL Editor → hamısını yapışdırın → Run. Təkrar işə salmaq təhlükəsizdir.
-- supabase_security_hardening.sql-dən SONRA icra edin (onun funksiyalarından istifadə edir:
-- zbod_is_admin, zbod_is_active, zbod_role).
--
-- Nə edir:
--  1. Tamamlanmış workshop-un hədəflərini saxlamaq üçün iki sütun əlavə edir. Struktur hədəfi
--     sonradan dəyişəndə köhnə workshop-un nəticəsi dəyişmir.
--  2. Strukturlara (divisions) çıxışı yalnız profili olan və AKTİV hesablara verir. Əvvəl yalnız
--     email yoxlanırdı: deaktiv edilmiş hesab, ya da özü qeydiyyatdan keçib email-i köhnə bir
--     strukturun sahibi ilə üst-üstə düşən biri o struktura çata bilərdi.
--  3. CxO siyahısını (ad, vəzifə, email) yalnız aktiv profili olanlar görə bilər.
-- ═══════════════════════════════════════════════════════════════════


-- 1. Tamamlanmış workshop-un hədəfləri (snapshot)
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS target_headcount_snapshot NUMERIC;
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS target_budget_snapshot    NUMERIC;


-- 2. Strukturlar: yalnız aktiv profil
DROP POLICY IF EXISTS "div_select" ON divisions;
CREATE POLICY "div_select" ON divisions FOR SELECT TO authenticated
  USING (
    public.zbod_is_admin()
    OR (public.zbod_is_active() AND (lower(owner_email) = lower(auth.email())
                                     OR lower(cxo_email) = lower(auth.email())))
  );

DROP POLICY IF EXISTS "div_update" ON divisions;
CREATE POLICY "div_update" ON divisions FOR UPDATE TO authenticated
  USING      (public.zbod_is_admin() OR (public.zbod_is_active() AND lower(owner_email) = lower(auth.email())))
  WITH CHECK (public.zbod_is_admin() OR (public.zbod_is_active() AND lower(owner_email) = lower(auth.email())));

DROP POLICY IF EXISTS "div_delete" ON divisions;
CREATE POLICY "div_delete" ON divisions FOR DELETE TO authenticated
  USING (public.zbod_is_admin() OR (public.zbod_is_active() AND lower(owner_email) = lower(auth.email())));


-- 3. CxO siyahısı: yalnız aktiv profili olanlar oxuyur
DROP POLICY IF EXISTS "profiles_select_cxo" ON profiles;
CREATE POLICY "profiles_select_cxo" ON profiles FOR SELECT TO authenticated
  USING (role = 'cxo' AND public.zbod_is_active());


CREATE TABLE IF NOT EXISTS schema_migrations (
  filename   TEXT        PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note       TEXT
);
INSERT INTO schema_migrations (filename, note)
VALUES ('supabase_production_hardening.sql',
        'workshops target snapshot columns; divisions + cxo list require an active profile')
ON CONFLICT (filename) DO NOTHING;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════
-- YOXLAMA
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'workshops' AND column_name LIKE 'target_%_snapshot';   -- 2 sətir
--   SELECT policyname, qual FROM pg_policies WHERE tablename = 'divisions';     -- zbod_is_active görünməlidir
-- ═══════════════════════════════════════════
