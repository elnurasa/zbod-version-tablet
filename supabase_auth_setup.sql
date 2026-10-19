-- ═══════════════════════════════════════════════════════════════════
-- ZBOD TOOL — SUPABASE AUTH (həqiqi giriş sistemi)
--
-- BU FAYLI supabase_full_setup.sql-DAN SONRA, BİR DƏFƏ İCRA EDİN.
--
-- NƏ ÜÇÜNDÜR:
-- Əvvəl parollar həm proqramın kodunda (admin), həm də bazada açıq mətn
-- kimi (HRBP/CxO) saxlanılırdı, rol yoxlaması isə yalnız brauzerdə
-- aparılırdı. Kod GitHub-da açıq olanda bu qəbuledilməzdir.
--
-- Bundan sonra:
--   • Parol nə kodda, nə də bazada saxlanılmır — Supabase Auth onu
--     hash-ləyib öz daxili auth.users cədvəlində saxlayır
--   • Rol və şəxsi məlumat profiles cədvəlində, auth istifadəçisinə
--     bağlı şəkildə saxlanılır
--   • İcazələr BAZADA tətbiq olunur: CxO başqa divisionun məlumatını
--     API vasitəsilə belə oxuya bilmir
--
-- ⚠️ BU FAYLI İŞƏ SALMAZDAN ƏVVƏL 2 ADDIM:
--
--   ADDIM 1 — Email təsdiqini söndürün
--   Authentication → Sign In / Providers → Email →
--   "Confirm email" açarını SÖNDÜRÜN → Save
--   (Əks halda proqramdan yaradılan hər yeni hesab təsdiq gözləyəcək.)
--
--   ADDIM 2 — Admin hesabını yaradın
--   Authentication → Users → "Add user" → "Create new user"
--     Email    : elnurasa@azerconnect.az
--     ✅ "Auto Confirm User" qutusunu İŞARƏLƏYİN
--
--   ADDIM 3 — Bu faylı bütöv şəkildə SQL Editor-da işə salın.
--   Faylın sonundakı admin profili bloku avtomatik işləyəcək.
-- ═══════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────
-- 1. PROFILES — rol və şəxsi məlumat
-- Parol sütunu YOXDUR: parolu yalnız Supabase Auth bilir.
-- id sütunu birbaşa auth.users-ə bağlıdır, hesab silinəndə profil də silinir.
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id                     UUID        PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role                   TEXT        NOT NULL DEFAULT 'hrbp',
  "fullName"             TEXT,
  position               TEXT,
  "areaOfResponsibility" TEXT,
  email                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'hrbp', 'cxo'));

CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles (lower(email));

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────
-- 2. KÖMƏKÇİ FUNKSİYALAR
-- SECURITY DEFINER vacibdir: funksiya profiles-i RLS-dən kənar oxuyur,
-- əks halda "profiles-in qaydası profiles-i oxumaq istəyir" sonsuz
-- dövrəsi yaranır.
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.zbod_is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT role = 'admin' FROM public.profiles WHERE id = auth.uid()), false);
$$;

CREATE OR REPLACE FUNCTION public.zbod_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- Struktura giriş: admin hər şeyi görür, HRBP sahib olduğunu, CxO təyin olunduğunu.
CREATE OR REPLACE FUNCTION public.zbod_can_read_division(div_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.zbod_is_admin() OR EXISTS (
    SELECT 1 FROM public.divisions d
    WHERE d.id = div_id
      AND (lower(d.owner_email) = lower(auth.email())
        OR lower(d.cxo_email)   = lower(auth.email()))
  );
$$;

-- AS-IS baseline-i yalnız admin və strukturun sahibi (HRBP) dəyişə bilər.
-- CxO onu yalnız oxuyur — bu, məhz sizin təyin etdiyiniz qaydadır.
CREATE OR REPLACE FUNCTION public.zbod_can_write_division(div_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.zbod_is_admin() OR EXISTS (
    SELECT 1 FROM public.divisions d
    WHERE d.id = div_id AND lower(d.owner_email) = lower(auth.email())
  );
$$;


-- ─────────────────────────────────────────
-- 3. PROFILES üzərində RLS
-- ─────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_insert" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;
DROP POLICY IF EXISTS "profiles_delete" ON profiles;

-- Hər kəs öz profilini oxuyur; admin hamısını (Manage Users səhifəsi üçün).
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.zbod_is_admin());

-- CxO profilləri hər kəsə oxunaqlıdır. Səbəb: HRBP yeni struktur yaradanda ona CxO təyin
-- etməlidir və "C-Level Full Name" siyahısı məhz bu sətirlərdən dolur — siyahını görməsə,
-- struktur yarada bilmir. Yalnız iş məlumatıdır (ad, vəzifə, email); parol onsuz da heç bir
-- profildə saxlanılmır. HRBP-lər bir-birinin profilini yenə görmür.
DROP POLICY IF EXISTS "profiles_select_cxo" ON profiles;
CREATE POLICY "profiles_select_cxo" ON profiles FOR SELECT TO authenticated
  USING (role = 'cxo');

-- Profil sətrini yalnız admin yarada bilər. Yəni kənar şəxs signUp() ilə
-- hesab açsa belə, ona rol verilmir və proqram onu içəri buraxmır.
CREATE POLICY "profiles_insert" ON profiles FOR INSERT TO authenticated
  WITH CHECK (public.zbod_is_admin());

CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated
  USING (public.zbod_is_admin()) WITH CHECK (public.zbod_is_admin());

CREATE POLICY "profiles_delete" ON profiles FOR DELETE TO authenticated
  USING (public.zbod_is_admin());


-- ─────────────────────────────────────────
-- 4. KÖHNƏ "hər kəsə hər şey" QAYDALARINI SİLİRİK
-- ─────────────────────────────────────────
DROP POLICY IF EXISTS "anon_select_divisions" ON divisions;
DROP POLICY IF EXISTS "anon_insert_divisions" ON divisions;
DROP POLICY IF EXISTS "anon_update_divisions" ON divisions;
DROP POLICY IF EXISTS "anon_delete_divisions" ON divisions;
DROP POLICY IF EXISTS "anon_select_workshops" ON workshops;
DROP POLICY IF EXISTS "anon_insert_workshops" ON workshops;
DROP POLICY IF EXISTS "anon_update_workshops" ON workshops;
DROP POLICY IF EXISTS "anon_delete_workshops" ON workshops;
DROP POLICY IF EXISTS "anon_select_wf" ON workshop_functions;
DROP POLICY IF EXISTS "anon_insert_wf" ON workshop_functions;
DROP POLICY IF EXISTS "anon_update_wf" ON workshop_functions;
DROP POLICY IF EXISTS "anon_delete_wf" ON workshop_functions;
DROP POLICY IF EXISTS "anon_select_asis" ON as_is_functions;
DROP POLICY IF EXISTS "anon_insert_asis" ON as_is_functions;
DROP POLICY IF EXISTS "anon_update_asis" ON as_is_functions;
DROP POLICY IF EXISTS "anon_delete_asis" ON as_is_functions;
DROP POLICY IF EXISTS "anon_select_landing" ON landing_box_settings;
DROP POLICY IF EXISTS "anon_insert_landing" ON landing_box_settings;
DROP POLICY IF EXISTS "anon_update_landing" ON landing_box_settings;
DROP POLICY IF EXISTS "anon_delete_landing" ON landing_box_settings;
DROP POLICY IF EXISTS "anon_select_users" ON users;
DROP POLICY IF EXISTS "anon_insert_users" ON users;
DROP POLICY IF EXISTS "anon_update_users" ON users;
DROP POLICY IF EXISTS "anon_delete_users" ON users;


-- ─────────────────────────────────────────
-- 5. DIVISIONS — yalnız öz strukturun
-- ─────────────────────────────────────────
CREATE POLICY "div_select" ON divisions FOR SELECT TO authenticated
  USING (public.zbod_is_admin()
      OR lower(owner_email) = lower(auth.email())
      OR lower(cxo_email)   = lower(auth.email()));

-- Yaradan şəxs özünü sahib yazmalıdır (başqasının adına struktur yaradıla bilməz).
CREATE POLICY "div_insert" ON divisions FOR INSERT TO authenticated
  WITH CHECK (public.zbod_is_admin() OR lower(owner_email) = lower(auth.email()));

CREATE POLICY "div_update" ON divisions FOR UPDATE TO authenticated
  USING (public.zbod_is_admin() OR lower(owner_email) = lower(auth.email()))
  WITH CHECK (public.zbod_is_admin() OR lower(owner_email) = lower(auth.email()));

CREATE POLICY "div_delete" ON divisions FOR DELETE TO authenticated
  USING (public.zbod_is_admin() OR lower(owner_email) = lower(auth.email()));


-- ─────────────────────────────────────────
-- 6. WORKSHOPS — CxO da yarada və apara bilər (sizin qaydanız)
-- ─────────────────────────────────────────
CREATE POLICY "ws_select" ON workshops FOR SELECT TO authenticated
  USING (public.zbod_can_read_division(division_id));
CREATE POLICY "ws_insert" ON workshops FOR INSERT TO authenticated
  WITH CHECK (public.zbod_can_read_division(division_id));
CREATE POLICY "ws_update" ON workshops FOR UPDATE TO authenticated
  USING (public.zbod_can_read_division(division_id))
  WITH CHECK (public.zbod_can_read_division(division_id));
CREATE POLICY "ws_delete" ON workshops FOR DELETE TO authenticated
  USING (public.zbod_can_read_division(division_id));


-- ─────────────────────────────────────────
-- 7. WORKSHOP_FUNCTIONS — icazə workshop → division zənciri ilə
-- ─────────────────────────────────────────
CREATE POLICY "wf_select" ON workshop_functions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM workshops w WHERE w.id = workshop_id AND public.zbod_can_read_division(w.division_id)));
CREATE POLICY "wf_insert" ON workshop_functions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM workshops w WHERE w.id = workshop_id AND public.zbod_can_read_division(w.division_id)));
CREATE POLICY "wf_update" ON workshop_functions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM workshops w WHERE w.id = workshop_id AND public.zbod_can_read_division(w.division_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM workshops w WHERE w.id = workshop_id AND public.zbod_can_read_division(w.division_id)));
CREATE POLICY "wf_delete" ON workshop_functions FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM workshops w WHERE w.id = workshop_id AND public.zbod_can_read_division(w.division_id)));


-- ─────────────────────────────────────────
-- 8. AS_IS_FUNCTIONS — CxO oxuyur, yalnız HRBP/Admin dəyişir
-- ─────────────────────────────────────────
CREATE POLICY "asis_select" ON as_is_functions FOR SELECT TO authenticated
  USING (public.zbod_can_read_division(division_id));
CREATE POLICY "asis_insert" ON as_is_functions FOR INSERT TO authenticated
  WITH CHECK (public.zbod_can_write_division(division_id));
CREATE POLICY "asis_update" ON as_is_functions FOR UPDATE TO authenticated
  USING (public.zbod_can_write_division(division_id))
  WITH CHECK (public.zbod_can_write_division(division_id));
CREATE POLICY "asis_delete" ON as_is_functions FOR DELETE TO authenticated
  USING (public.zbod_can_write_division(division_id));


-- ─────────────────────────────────────────
-- 9. LANDING_BOX_SETTINGS
-- Metodologiya mətnləri: hər kəs oxuyur, yalnız admin yazır.
-- Key Findings (aaa_cards_*): strukturla işləyən HRBP/CxO da yaza bilər.
-- Strategic Overview (strategic_overview_<cxoId>): görünmə qaydaları ayrıca
-- supabase_strategic_overview.sql faylındadır — həmin faylı bu fayldan
-- SONRA icra edin, o bu qaydaları öz üzərinə yazır.
-- ─────────────────────────────────────────
CREATE POLICY "landing_select" ON landing_box_settings FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "landing_insert" ON landing_box_settings FOR INSERT TO authenticated
  WITH CHECK (public.zbod_is_admin() OR box_id LIKE 'aaa_cards_%');
CREATE POLICY "landing_update" ON landing_box_settings FOR UPDATE TO authenticated
  USING (public.zbod_is_admin() OR box_id LIKE 'aaa_cards_%')
  WITH CHECK (public.zbod_is_admin() OR box_id LIKE 'aaa_cards_%');
CREATE POLICY "landing_delete" ON landing_box_settings FOR DELETE TO authenticated
  USING (public.zbod_is_admin() OR box_id LIKE 'aaa_cards_%');


-- ─────────────────────────────────────────
-- 10. KÖHNƏ users CƏDVƏLİ
-- Açıq mətnli parol saxladığı üçün artıq istifadə olunmur. Silmirik ki,
-- köhnə məlumat itməsin — sadəcə heç kimin girişi olmasın.
-- Hər şeyin işlədiyinə əmin olandan sonra silə bilərsiniz:
--   DROP TABLE users;
-- ─────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- (yuxarıda bütün anon_* qaydaları silindi, yenisi yaradılmır → giriş bağlıdır)


-- ═══════════════════════════════════════════════════════════════════
-- 11. İLK ADMİN HESABI
--
-- Profil sətrini yalnız admin yarada bilər, ilk admini isə kimsə
-- yaratmalıdır — ona görə birinci hesabı əl ilə əlavə edirik.
--
-- Bu blok AVTOMATİK işləyir — heç nə redaktə etmək lazım deyil.
-- ŞƏRT: bu faylı işə salmazdan ƏVVƏL admin hesabı Authentication →
-- Users bölməsində yaradılmış olmalıdır (faylın əvvəlindəki addımlara bax).
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO profiles (id, role, "fullName", position, "areaOfResponsibility", email)
SELECT id, 'admin', 'Admin', 'Administrator', 'All', email
FROM auth.users
WHERE lower(email) = lower('elnurasa@azerconnect.az')
ON CONFLICT (id) DO UPDATE SET role = 'admin';


NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════
-- HAZIRDIR
--
-- Bundan sonra:
--   • Parol heç yerdə — nə kodda, nə bazada — açıq saxlanılmır
--   • Proqramın kodu tamamilə açıq (public) ola bilər
--   • İcazələr bazada tətbiq olunur: CxO başqa divisionun məlumatını
--     birbaşa API ilə də oxuya bilmir
-- ═══════════════════════════════════════════
