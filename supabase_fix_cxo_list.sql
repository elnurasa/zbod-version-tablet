-- ═══════════════════════════════════════════════════════════════════
-- DÜZƏLİŞ: "C-Level Full Name" siyahısı boş görünürdü
--
-- PROBLEM:
-- HRBP yeni struktur yaradanda "Select CxO" siyahısı boş qalırdı.
-- Səbəb: profiles cədvəlinin oxuma qaydası hər kəsə YALNIZ öz profilini
-- göstərirdi, ona görə HRBP heç bir CxO-nu görə bilmirdi.
--
-- HƏLL:
-- CxO profillərini bütün daxil olmuş istifadəçilər üçün oxunaqlı edirik.
-- Bu, yalnız iş məlumatıdır (ad, vəzifə, email) — parol onsuz da heç bir
-- profildə saxlanılmır. HRBP-lər bir-birinin profilini yenə görmür.
--
-- Bu faylı Supabase SQL Editor-da bir dəfə işə salın.
-- ═══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "profiles_select_cxo" ON profiles;
CREATE POLICY "profiles_select_cxo" ON profiles FOR SELECT TO authenticated
  USING (role = 'cxo');

NOTIFY pgrst, 'reload schema';

-- Yoxlama: bu sorğu qaydaların siyahısını göstərir.
-- "profiles_select_cxo" adlı sətir görünməlidir.
-- SELECT policyname FROM pg_policies WHERE tablename = 'profiles';
