-- ═══════════════════════════════════════════════════════════════════
-- ZBOD TOOL — Strategic Overview görünmə qaydaları
--
-- Bu faylı Supabase SQL Editor-da bir dəfə icra edin.
--
-- NƏ ÜÇÜNDÜR:
-- Strategic Overview artıq STRUKTUR üzrə deyil, C-LEVEL və onun məsuliyyət
-- sahəsi üzrə saxlanılır (bir CxO-nun iki sahəsi ola bilər — hər birinin
-- öz rəqəmləri). Qeydlər landing_box_settings cədvəlində
-- box_id = 'strategic_overview_<cxoProfilId>' şəklində saxlanılır.
--
-- Əvvəl bu cədvəlin oxuma qaydası hər kəsə hər şeyi verirdi. İndi:
--   • Admin  — hamısını görür və yalnız o dəyişə bilər
--   • CxO    — yalnız özünün sahələrini görür
--   • HRBP   — yalnız özünün yaratdığı strukturlara TƏYİN ETDİYİ
--              CxO-ların rəqəmlərini görür
--   • Metodologiya mətnləri (overview, guideline, principles və s.)
--     əvvəlki kimi hər kəsə açıqdır
-- ═══════════════════════════════════════════════════════════════════


-- Verilmiş strategic_overview_<uuid> box_id-sindən profil id-sini çıxarır.
-- box_id düzgün formada deyilsə NULL qaytarır (xəta atmır).
CREATE OR REPLACE FUNCTION public.zbod_box_cxo_id(box TEXT)
RETURNS UUID LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN box ~ '^strategic_overview_[0-9a-fA-F-]{36}$'
      THEN substring(box from 20)::uuid
    ELSE NULL
  END;
$$;

-- Bu hesab həmin C-level-in rəqəmlərini görə bilərmi?
CREATE OR REPLACE FUNCTION public.zbod_can_see_cxo_targets(cxo UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.zbod_is_admin()
    -- CxO özü
    OR cxo = auth.uid()
    -- Həmin CxO-nu öz strukturuna təyin etmiş HRBP
    OR EXISTS (
      SELECT 1
      FROM public.divisions d
      JOIN public.profiles p ON lower(p.email) = lower(d.cxo_email)
      WHERE p.id = cxo
        AND lower(d.owner_email) = lower(auth.email())
    );
$$;


-- ─────────────────────────────────────────
-- Oxuma qaydasını əvəz edirik
-- ─────────────────────────────────────────
DROP POLICY IF EXISTS "landing_select" ON landing_box_settings;
CREATE POLICY "landing_select" ON landing_box_settings FOR SELECT TO authenticated
  USING (
    -- Strategic Overview olmayan hər şey (metodologiya, Key Findings və s.) hamıya açıqdır
    public.zbod_box_cxo_id(box_id) IS NULL
    -- Strategic Overview isə yalnız icazəsi olana
    OR public.zbod_can_see_cxo_targets(public.zbod_box_cxo_id(box_id))
  );


-- ─────────────────────────────────────────
-- Yazma: Strategic Overview-i yalnız admin dəyişir.
-- Key Findings (aaa_cards_*) əvvəlki kimi HRBP/CxO tərəfindən yazıla bilər.
-- ─────────────────────────────────────────
DROP POLICY IF EXISTS "landing_insert" ON landing_box_settings;
CREATE POLICY "landing_insert" ON landing_box_settings FOR INSERT TO authenticated
  WITH CHECK (public.zbod_is_admin() OR box_id LIKE 'aaa_cards_%');

DROP POLICY IF EXISTS "landing_update" ON landing_box_settings;
CREATE POLICY "landing_update" ON landing_box_settings FOR UPDATE TO authenticated
  USING (public.zbod_is_admin() OR box_id LIKE 'aaa_cards_%')
  WITH CHECK (public.zbod_is_admin() OR box_id LIKE 'aaa_cards_%');

DROP POLICY IF EXISTS "landing_delete" ON landing_box_settings;
CREATE POLICY "landing_delete" ON landing_box_settings FOR DELETE TO authenticated
  USING (public.zbod_is_admin() OR box_id LIKE 'aaa_cards_%');


NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════
-- HAZIRDIR
--
-- Yoxlama üçün:
--   SELECT policyname FROM pg_policies WHERE tablename = 'landing_box_settings';
-- ═══════════════════════════════════════════
