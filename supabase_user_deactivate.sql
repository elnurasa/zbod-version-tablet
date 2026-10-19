-- ═══════════════════════════════════════════════════════════════════
-- ZBOD TOOL — İstifadəçini silmək əvəzinə deaktiv etmək
--
-- Bu faylı Supabase SQL Editor-da bir dəfə icra edin.
--
-- PROBLEM:
-- Admin istifadəçini silib eyni email ilə yenidən yaratmaq istəyəndə
-- "User already registered" xətası çıxırdı və hesab bir daha yaradıla
-- bilmirdi.
--
-- SƏBƏBİ:
-- "Sil" düyməsi yalnız profiles sətrini silirdi. Parolu saxlayan əsl
-- hesab isə Supabase Auth-un daxili auth.users cədvəlində qalırdı —
-- onu brauzerdən silmək mümkün deyil, bunun üçün service_role açarı
-- lazımdır və o açar heç vaxt kliyent koduna qoyulmamalıdır.
-- Nəticədə: email məşğul qalırdı, profil isə yox idi — yəni hesab nə
-- işləyirdi, nə də yenidən yaradıla bilirdi.
--
-- HƏLL:
-- Profil silinmir, DEAKTİV edilir. Beləliklə:
--   • Deaktiv hesab proqrama girə bilmir
--   • Eyni email ilə "yenidən yaratmaq" istəyəndə proqram mövcud
--     profili tapıb yenidən aktivləşdirir — Supabase Auth-a toxunmur
--   • Hesabın tarixçəsi (kimin nə vaxt yaradıldığı) itmir
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Mövcud hesabların hamısı aktiv sayılır.
UPDATE profiles SET is_active = true WHERE is_active IS NULL;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════
-- HAZIRDIR
--
-- QEYD — əvvəllər silinmiş hesablar:
-- Bu düzəlişdən ƏVVƏL silinmiş hesabların profili artıq yoxdur, amma
-- Supabase Auth hesabı qalıb. Onları geri qaytarmaq üçün iki yol var:
--
--   1) Həmin email-i tamamilə azad etmək:
--      Authentication → Users → həmin sətri tapıb silin.
--      Bundan sonra proqramdan yenidən yaradıla bilər.
--
--   2) Və ya sadəcə başqa email istifadə edin.
--
-- Hansı email-lərin "asılı qaldığını" görmək üçün:
--   SELECT u.email
--   FROM auth.users u
--   LEFT JOIN profiles p ON p.id = u.id
--   WHERE p.id IS NULL;
-- ═══════════════════════════════════════════
