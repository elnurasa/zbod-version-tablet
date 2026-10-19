-- ═══════════════════════════════════════════════════════════════════
-- ZBOD TOOL — Təhlükəsizlik düzəlişləri
--
-- ⚠️ BUNU TƏCİLİ İCRA EDİN. Supabase → SQL Editor → hamısını yapışdırın → Run.
-- Təkrar işə salmaq təhlükəsizdir.
--
-- Aşağıdakı 1-ci bənd hazırda CANLI açıq bir deşiyi bağlayır.
-- ═══════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────
-- 1. ⚠️ KRİTİK — as_is_functions hamıya açıqdır
--
-- supabase_full_setup.sql "anon_select_ais" adı ilə dörd icazə yaradıb
-- (hamısı USING(true), TO clause-suz — yəni giriş etməmiş anon rolu da daxil).
-- supabase_auth_setup.sql onları silməyə çalışıb, amma adı "anon_select_asis"
-- yazıb — bir hərf fərqi. DROP POLICY IF EXISTS səhv adda səssizcə heç nə etmir,
-- ona görə həmin dörd icazə bu gün də qüvvədədir.
--
-- Nəticə: anon açarı ilə (o açar GitHub Pages-də hamıya açıqdır) heç bir hesab
-- olmadan bütün strukturların AS-IS bazasını — funksiya adları, adam sayı,
-- MENECER VƏ İŞÇİ MAAŞ XƏRCLƏRİ — oxumaq, dəyişmək və silmək mümkündür.
-- ─────────────────────────────────────────
DROP POLICY IF EXISTS "anon_select_ais" ON as_is_functions;
DROP POLICY IF EXISTS "anon_insert_ais" ON as_is_functions;
DROP POLICY IF EXISTS "anon_update_ais" ON as_is_functions;
DROP POLICY IF EXISTS "anon_delete_ais" ON as_is_functions;


-- ─────────────────────────────────────────
-- 2. Deaktiv edilmiş hesab həqiqətən bağlansın
--
-- is_active yalnız proqramın içində yoxlanılırdı (script.js resolveSession).
-- Yəni deaktiv edilmiş işçinin parolu hələ də işləyirdi: proqram onu giriş
-- ekranına qaytarırdı, amma API səviyyəsində bütün icazələri qalırdı.
-- Köhnə sətirlərdə is_active NULL ola bilər — COALESCE ilə "aktiv" sayılır.
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.zbod_is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT role = 'admin' AND COALESCE(is_active, true)
      FROM public.profiles WHERE id = auth.uid()
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.zbod_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles
   WHERE id = auth.uid() AND COALESCE(is_active, true);
$$;

CREATE OR REPLACE FUNCTION public.zbod_is_active()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT COALESCE(is_active, true) FROM public.profiles WHERE id = auth.uid()), false);
$$;

CREATE OR REPLACE FUNCTION public.zbod_can_read_division(div_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.zbod_is_admin() OR (public.zbod_is_active() AND EXISTS (
    SELECT 1 FROM public.divisions d
    WHERE d.id = div_id
      AND (lower(d.owner_email) = lower(auth.email())
        OR lower(d.cxo_email)   = lower(auth.email()))
  ));
$$;

CREATE OR REPLACE FUNCTION public.zbod_can_write_division(div_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.zbod_is_admin() OR (public.zbod_is_active() AND EXISTS (
    SELECT 1 FROM public.divisions d
    WHERE d.id = div_id AND lower(d.owner_email) = lower(auth.email())
  ));
$$;


-- ─────────────────────────────────────────
-- 3. AS-IS Metrics və Key Findings başqa strukturdan oxunmasın
--
-- Hazırkı landing_select yalnız Strategic Overview sətirlərini qoruyurdu:
-- box_id "strategic_overview_" ilə başlamırsa, "hamıya açıq" sayılırdı.
-- Ona görə istənilən HRBP və ya CxO bir sorğu ilə BÜTÜN strukturların
-- AS-IS Metrics-ini (o cümlədən menecer/işçi maaş medianlarını) və
-- Key Findings mətnlərini oxuya bilirdi.
--
-- İndi struktura bağlı bloklar (metrics_*, aaa_cards_*) həmin strukturu
-- görmək icazəsi olanlarla məhdudlaşır. Metodologiya mətnləri (overview,
-- gl1..gl7, mq1..mq3 və s.) əvvəlki kimi hamıya açıqdır — onlar ümumidir.
-- ─────────────────────────────────────────
DROP POLICY IF EXISTS "landing_select" ON landing_box_settings;
CREATE POLICY "landing_select" ON landing_box_settings FOR SELECT TO authenticated
  USING (
    CASE
      WHEN public.zbod_box_cxo_id(box_id) IS NOT NULL
        THEN public.zbod_can_see_cxo_targets(public.zbod_box_cxo_id(box_id))
      WHEN public.zbod_box_division_id(box_id) IS NOT NULL
        THEN public.zbod_can_read_division(public.zbod_box_division_id(box_id))
      ELSE true
    END
  );


-- ─────────────────────────────────────────
-- 4. Struktur yaratmaq yalnız HRBP və adminə
--
-- div_insert yalnız owner_email = auth.email() yoxlayırdı, rolu yox.
-- Yəni CxO özünü sahib göstərib struktur yarada bilirdi — və bununla həm
-- yazma icazəsi qazanırdı, həm də istənilən CxO-nun Strategic Overview-nu
-- oxumaq üçün lazım olan bağlantını düzəldə bilirdi.
-- ─────────────────────────────────────────
DROP POLICY IF EXISTS "div_insert" ON divisions;
CREATE POLICY "div_insert" ON divisions FOR INSERT TO authenticated
  WITH CHECK (
    public.zbod_is_admin()
    OR (public.zbod_role() = 'hrbp' AND lower(owner_email) = lower(auth.email()))
  );


-- ─────────────────────────────────────────
-- 5. zbod_box_cxo_id səhv formatda xəta atmasın
--
-- Köhnə regex 36 simvolluq istənilən "0-9a-fA-F-" ardıcıllığını qəbul edirdi
-- (məsələn 36 tire), sonra ::uuid çevirməsi xəta atırdı. landing_select bu
-- funksiyanı HƏR sətir üçün çağırdığından bir belə sətir bütün cədvəlin
-- oxunmasını dayandırardı.
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.zbod_box_cxo_id(box TEXT)
RETURNS UUID LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN box ~ '^strategic_overview_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN substring(box from 20)::uuid
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.zbod_box_division_id(box TEXT)
RETURNS UUID LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN box ~ '^metrics_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN substring(box from 9)::uuid
    WHEN box ~ '^aaa_cards_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN substring(box from 11)::uuid
    ELSE NULL
  END;
$$;


INSERT INTO schema_migrations (filename, note)
VALUES ('supabase_security_hardening.sql',
        'anon_*_ais açıq icazələri silindi; is_active tətbiq edildi; landing_select struktura bağlandı; div_insert rol yoxlayır')
ON CONFLICT (filename) DO NOTHING;


NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════
-- YOXLAMA
--
-- 1) Açıq icazə qalmadığını təsdiqləyin — sətir QAYITMAMALIDIR:
--    SELECT policyname, roles, cmd FROM pg_policies
--     WHERE tablename = 'as_is_functions' AND policyname LIKE 'anon%';
--
-- 2) Bütün cədvəllərdə açıq qalan qaydaları görmək üçün:
--    SELECT tablename, policyname, roles, cmd, qual FROM pg_policies
--     WHERE schemaname = 'public' AND (qual = 'true' OR with_check = 'true')
--     ORDER BY tablename;
-- ═══════════════════════════════════════════
