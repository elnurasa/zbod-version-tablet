-- ═══════════════════════════════════════════════════════════════════
-- ZBOD TOOL — Hesabı TAM silmək (Auth hesabı da daxil)
--
-- Bu faylı Supabase SQL Editor-da bir dəfə icra edin.
--
-- PROBLEM:
-- Hesab silinəndən sonra eyni email ilə yenidən yaratmaq mümkün olmurdu
-- ("User already registered"). Çünki proqram yalnız profiles sətrini
-- silirdi; parolu saxlayan əsl hesab Supabase Auth-un auth.users
-- cədvəlində qalırdı və onu brauzerdən silmək mümkün deyil.
--
-- HƏLL:
-- Bazada admin-only funksiya yaradırıq. Funksiya SECURITY DEFINER-dir,
-- yəni auth.users-i silmək səlahiyyəti onun özündədir — brauzerə heç bir
-- gizli açar (service_role) qoymağa ehtiyac qalmır. İçəridə isə admin
-- olub-olmadığı yoxlanılır, ona görə başqa heç kim çağıra bilməz.
--
-- profiles.id → auth.users(id) ON DELETE CASCADE olduğu üçün Auth hesabı
-- silinəndə profil də avtomatik silinir. Yəni hesab sanki heç olmayıb.
-- ═══════════════════════════════════════════════════════════════════


CREATE OR REPLACE FUNCTION public.zbod_delete_user(target UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Yalnız admin. Bu yoxlama olmasa, funksiya hər kəsə hesab silmək
  -- imkanı verərdi — SECURITY DEFINER onu çağıranın deyil, sahibinin
  -- səlahiyyəti ilə işlədir.
  IF NOT public.zbod_is_admin() THEN
    RAISE EXCEPTION 'Yalnız admin hesab silə bilər';
  END IF;

  -- Admin özünü silməsin — əks halda sistemdə admin qalmaya bilər.
  IF target = auth.uid() THEN
    RAISE EXCEPTION 'Öz hesabınızı silə bilməzsiniz';
  END IF;

  DELETE FROM auth.users WHERE id = target;   -- profil CASCADE ilə silinir
END;
$$;

REVOKE ALL ON FUNCTION public.zbod_delete_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zbod_delete_user(UUID) TO authenticated;


-- ─────────────────────────────────────────
-- Əvvəllər silinmiş hesabların "asılı qalmış" email-lərini azad edirik.
-- Bunlar profili olmayan Auth hesablarıdır — proqramda istifadə oluna
-- bilmirlər, sadəcə email-i tuturlar. Silindikdən sonra həmin email-lərlə
-- yenidən hesab yaratmaq mümkün olacaq.
--
-- (Supabase panelindən əl ilə yaradıb hələ proqramda rol verilməmiş
--  hesab varsa, o da bura düşər — belə hesabınız varsa əvvəlcə
--  aşağıdakı SELECT ilə siyahıya baxın.)
-- ─────────────────────────────────────────

-- Əvvəlcə görmək üçün:
-- SELECT u.email FROM auth.users u LEFT JOIN profiles p ON p.id = u.id WHERE p.id IS NULL;

DELETE FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = u.id);


NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════
-- HAZIRDIR
-- Bundan sonra Manage Users-dəki "Sil" düyməsi hesabı tam silir və
-- eyni email ilə dərhal yenidən yaradıla bilər.
-- ═══════════════════════════════════════════
