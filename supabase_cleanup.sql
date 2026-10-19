-- ═══════════════════════════════════════════════════════════════════
-- ZBOD TOOL — Təmizləmə və miqrasiya qeydiyyatı
--
-- Bu faylı Supabase SQL Editor-da bir dəfə icra edin.
--
-- İKİ İŞ GÖRÜR:
--   1. Köhnə `users` cədvəlini silir — orada HRBP/CxO parolları AÇIQ
--      MƏTNLƏ qalıb. Supabase Auth-a keçdikdən sonra o cədvəl istifadə
--      olunmur (proqram ona heç müraciət etmir) və RLS qaydaları da
--      silinib, amma sətirlər hələ bazadadır.
--   2. Hansı SQL faylının icra olunduğunu qeyd edən kiçik cədvəl yaradır
--      ki, gələcəkdə (və ya ikinci mühit qurarkən) təxmin etmək
--      lazım gəlməsin.
--
-- Proqramın işləyən məntiqinə heç bir təsiri yoxdur.
-- ═══════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────
-- 1. Açıq mətnli parolları saxlayan köhnə cədvəli silirik
-- ─────────────────────────────────────────
-- Əvvəlcə nə itirdiyinizi görmək istəsəniz (parolları EKRANA ÇIXARIR,
-- ehtiyatlı olun və ekran şəkli çəkməyin):
--   SELECT email, role FROM users;

DROP TABLE IF EXISTS users;


-- ─────────────────────────────────────────
-- 2. Miqrasiya qeydiyyatı
-- Hansı quraşdırma faylının nə vaxt işlədildiyini saxlayır.
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename   TEXT        PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note       TEXT
);

ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "migrations_select" ON schema_migrations;
CREATE POLICY "migrations_select" ON schema_migrations FOR SELECT TO authenticated
  USING (public.zbod_is_admin());

-- Bu günə qədər icra olunmuş fayllar (ardıcıllıqla):
INSERT INTO schema_migrations (filename, note) VALUES
  ('supabase_full_setup.sql',        'Əsas sxem: bütün cədvəllər, indekslər, trigger-lər'),
  ('supabase_auth_setup.sql',        'Supabase Auth + profiles + auth.uid()-ə bağlı RLS'),
  ('supabase_fix_cxo_list.sql',      'HRBP struktur yaradanda CxO siyahısını görsün'),
  ('supabase_strategic_overview.sql','Strategic Overview: CxO + məsuliyyət sahəsi üzrə görünmə'),
  ('supabase_user_deactivate.sql',   'profiles.is_active sütunu'),
  ('supabase_delete_user.sql',       'Hesabı tam silmək (zbod_delete_user) + asılı qalmış email-lərin təmizlənməsi'),
  ('supabase_metrics_sync.sql',      'AS-IS Metrics buludla sinxronlaşması + yazma icazələri'),
  ('supabase_cleanup.sql',           'Köhnə users cədvəlinin silinməsi + bu qeydiyyat cədvəli')
ON CONFLICT (filename) DO NOTHING;


NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════
-- HAZIRDIR
--
-- Yoxlamaq üçün:
--   SELECT filename, applied_at FROM schema_migrations ORDER BY applied_at;
--
-- Bundan sonra yeni SQL faylı işlədəndə sonuna bunu əlavə edin:
--   INSERT INTO schema_migrations (filename, note)
--   VALUES ('fayl_adi.sql', 'nə etdiyi') ON CONFLICT DO NOTHING;
-- ═══════════════════════════════════════════
