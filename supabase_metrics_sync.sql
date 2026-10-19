-- ═══════════════════════════════════════════════════════════════════
-- ZBOD TOOL — AS-IS Metrics-in buludla sinxronlaşması
--
-- Bu faylı Supabase SQL Editor-da bir dəfə icra edin.
--
-- PROBLEM:
-- AS-IS Metrics sahələrinə yazılan dəyərlər yalnız həmin brauzerin
-- yaddaşında qalırdı — başqa kompüterdə açanda boş görünürdü.
-- Səbəb: bu məlumat heç vaxt buluda göndərilmirdi.
--
-- HƏLL (kod tərəfi artıq hazırdır):
-- Metrics indi landing_box_settings cədvəlində saxlanılır,
-- box_id = 'metrics_<strukturId>' şəklində — Key Findings kartları ilə
-- eyni üsul, yəni yeni cədvəl lazım deyil.
--
-- Bu fayl yalnız YAZMA İCAZƏSİNİ tənzimləyir: metrics sətirlərini
-- strukturun sahibi (HRBP) və admin yaza bilsin.
-- ═══════════════════════════════════════════════════════════════════


-- box_id-nin sonundakı struktur id-sini çıxarır ('metrics_<uuid>',
-- 'aaa_cards_<uuid>'). Uyğun gəlmirsə NULL qaytarır — xəta atmır.
CREATE OR REPLACE FUNCTION public.zbod_box_division_id(box TEXT)
RETURNS UUID LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN box ~ '^metrics_[0-9a-fA-F-]{36}$'    THEN substring(box from 9)::uuid
    WHEN box ~ '^aaa_cards_[0-9a-fA-F-]{36}$'  THEN substring(box from 11)::uuid
    ELSE NULL
  END;
$$;


-- ─────────────────────────────────────────
-- Yazma qaydaları
-- Admin hər şeyi yaza bilər. Struktura bağlı qeydləri (AS-IS Metrics və
-- Key Findings) isə yalnız həmin strukturun sahibi olan HRBP yaza bilər —
-- CxO onları oxuyur, dəyişmir. Bu, proqramdakı qaydanın eynisidir, sadəcə
-- indi baza səviyyəsində tətbiq olunur.
-- ─────────────────────────────────────────
DROP POLICY IF EXISTS "landing_insert" ON landing_box_settings;
CREATE POLICY "landing_insert" ON landing_box_settings FOR INSERT TO authenticated
  WITH CHECK (
    public.zbod_is_admin()
    OR public.zbod_can_write_division(public.zbod_box_division_id(box_id))
  );

DROP POLICY IF EXISTS "landing_update" ON landing_box_settings;
CREATE POLICY "landing_update" ON landing_box_settings FOR UPDATE TO authenticated
  USING (
    public.zbod_is_admin()
    OR public.zbod_can_write_division(public.zbod_box_division_id(box_id))
  )
  WITH CHECK (
    public.zbod_is_admin()
    OR public.zbod_can_write_division(public.zbod_box_division_id(box_id))
  );

DROP POLICY IF EXISTS "landing_delete" ON landing_box_settings;
CREATE POLICY "landing_delete" ON landing_box_settings FOR DELETE TO authenticated
  USING (
    public.zbod_is_admin()
    OR public.zbod_can_write_division(public.zbod_box_division_id(box_id))
  );


NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════
-- HAZIRDIR
--
-- Bundan sonra AS-IS Metrics dəyərləri buluda yazılacaq və istənilən
-- kompüterdə görünəcək.
--
-- ⚠️ ARTIQ DAXİL EDİLMİŞ METRİKLƏR:
-- Bu düzəlişdən əvvəl yazılmış dəyərlər hələ yalnız sizin brauzerinizdədir.
-- Onları buluda qaldırmaq üçün: həmin kompüterdə proqramı açın, F12 →
-- Console-da bunu işlədin, sonra səhifəni yeniləyin:
--
--   const m = JSON.parse(localStorage.getItem('zbod_metrics') || '{}');
--   Object.keys(m).forEach(d => window.zbodSupabase.sbSaveLandingBox({
--     box_id: 'metrics_' + d, title: 'AS-IS Metrics',
--     content: JSON.stringify(m[d]), position_order: 9100 }));
--   console.log('Göndərildi:', Object.keys(m).length, 'struktur');
-- ═══════════════════════════════════════════
