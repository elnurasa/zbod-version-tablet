-- ═══════════════════════════════════════════════════════════════════
-- ZBOD TOOL — TAM QURULUM (boş/yeni Supabase proyekti üçün)
--
-- BU FAYLI BİR DƏFƏ, BÜTÖV ŞƏKİLDƏ Supabase SQL Editor-da işə salın.
--
-- İçindəkilər:
--   HİSSƏ 1 — Bütün cədvəllərin yaradılması (divisions, workshops,
--             workshop_functions, as_is_functions, landing_box_settings),
--             indekslər, trigger-lər və RLS qaydaları
--   HİSSƏ 2 — Sonrakı düzəlişlər: çatışmayan sütunlar (owner_email,
--             cxo_email, source, as_is_*) və users cədvəli
--
-- Ayrıca supabase_setup.sql / supabase_migration_fix.sql işlətməyə
-- EHTİYAC YOXDUR — hər ikisi bu faylın içindədir, düzgün ardıcıllıqla.
-- Təkrar işə salmaq təhlükəsizdir (IF NOT EXISTS / OR REPLACE istifadə olunur).
-- ═══════════════════════════════════════════════════════════════════


-- ███████████████████████████████████████████████████████████████████
-- HİSSƏ 1 — ƏSAS SXEM
-- ███████████████████████████████████████████████████████████████████

-- ═══════════════════════════════════════════════════════════════════
-- ZBOD TOOL — Supabase Database Setup  (complete, run once)
-- Project : (bu faylı hansı Supabase proyektində işə salırsınızsa, ora aiddir)
-- Access  : shared/public — no authentication, anon key only
-- ═══════════════════════════════════════════════════════════════════

-- UUID extension (already on by default in Supabase, safe to repeat)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────
-- HELPER: auto-stamp updated_at on every UPDATE
-- ─────────────────────────────────────────
-- The client (script.js) always sets updated_at itself on every add/update, and its
-- localStorage<->Supabase merge (loadFromSupabase) picks whichever copy of a record has the
-- newer updated_at. Unconditionally stamping NOW() here discarded that client timestamp and
-- replaced it with "whenever this row happened to reach the server" — so a device that synced an
-- older offline edit late could make it look newer than a genuinely more recent edit made by
-- another device in between, and the merge would keep the stale content. Only fall back to NOW()
-- when the client didn't supply one at all.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.updated_at IS NULL THEN
    NEW.updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ═══════════════════════════════════════════
-- TABLE: divisions
-- One row per organisational structure (division / dept / unit).
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS divisions (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              TEXT        NOT NULL,
  structure_type    TEXT        NOT NULL DEFAULT 'Division',
  password          TEXT        NOT NULL,
  creator_name      TEXT,
  creator_position  TEXT,
  creator_email     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_divisions_updated_at ON divisions (updated_at DESC);

DROP TRIGGER IF EXISTS trg_divisions_updated_at ON divisions;
CREATE TRIGGER trg_divisions_updated_at
  BEFORE UPDATE ON divisions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ═══════════════════════════════════════════
-- TABLE: workshops
-- One or more workshop sessions per division.
-- Deleting a division cascades to its workshops.
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS workshops (
  id                            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  division_id                   UUID        NOT NULL REFERENCES divisions (id) ON DELETE CASCADE,
  status                        TEXT        NOT NULL DEFAULT 'draft',
  phase                         INTEGER     NOT NULL DEFAULT 1,
  completed_at                  TIMESTAMPTZ,
  submitted_for_hr_review_at    TIMESTAMPTZ,
  source                        TEXT,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pre-existing databases created before the `source` column was added: this makes re-running
-- the script idempotent instead of failing on an already-created table.
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS source TEXT;

CREATE INDEX IF NOT EXISTS idx_workshops_division_id ON workshops (division_id);
CREATE INDEX IF NOT EXISTS idx_workshops_updated_at  ON workshops (updated_at DESC);

DROP TRIGGER IF EXISTS trg_workshops_updated_at ON workshops;
CREATE TRIGGER trg_workshops_updated_at
  BEFORE UPDATE ON workshops
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ═══════════════════════════════════════════
-- TABLE: workshop_functions
-- Functions created and assessed across Phases 1–3.
-- Deleting a workshop cascades to its functions.
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS workshop_functions (
  id                       UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  workshop_id              UUID        NOT NULL REFERENCES workshops (id) ON DELETE CASCADE,
  function_number          INTEGER,
  proposed_function_name   TEXT,
  career_level             TEXT,
  function_structure_type  TEXT,
  parent_id                TEXT,
  strategic_justification  TEXT,
  -- Phase 1 filters
  can_be_eliminated        TEXT,
  can_be_automated         TEXT,
  can_be_outsourced        TEXT,
  justification_alert      TEXT,
  -- Phase 2 scoring
  question1_score          NUMERIC,
  question2_score          NUMERIC,
  total_score              NUMERIC,
  zbod_decision            TEXT,
  -- Phase 3 HC & cost allocation
  target_headcount         NUMERIC,
  target_budget            NUMERIC,
  total_hc                 NUMERIC,
  hc_allocation_percent    NUMERIC,
  proposed_hc              NUMERIC,
  total_budget             NUMERIC,
  cost_allocation_percent  NUMERIC,
  proposed_budget          NUMERIC,
  manager_count            NUMERIC,
  professional_count       NUMERIC,
  span_of_control          NUMERIC,
  span_alert               TEXT,
  -- AS-IS Baseline reference (Analyze AS-IS Baseline workshops only): the percentage this
  -- function represented in the AS-IS structure, captured once when the workshop was copied from
  -- AS-IS. Shown as a fixed "As-Is: X%" hint next to the editable HC/Cost Allocation % inputs in
  -- Phase 3; never touched by later edits.
  as_is_hc_percent         NUMERIC,
  as_is_cost_percent       NUMERIC,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pre-existing databases created before the as_is_*_percent columns were added: this makes
-- re-running the script idempotent instead of failing on an already-created table.
ALTER TABLE workshop_functions ADD COLUMN IF NOT EXISTS as_is_hc_percent NUMERIC;
ALTER TABLE workshop_functions ADD COLUMN IF NOT EXISTS as_is_cost_percent NUMERIC;

CREATE INDEX IF NOT EXISTS idx_wf_workshop_id     ON workshop_functions (workshop_id);
CREATE INDEX IF NOT EXISTS idx_wf_function_number ON workshop_functions (workshop_id, function_number);
CREATE INDEX IF NOT EXISTS idx_wf_updated_at      ON workshop_functions (updated_at DESC);

DROP TRIGGER IF EXISTS trg_wf_updated_at ON workshop_functions;
CREATE TRIGGER trg_wf_updated_at
  BEFORE UPDATE ON workshop_functions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ═══════════════════════════════════════════
-- TABLE: as_is_functions
-- Current-state (As-Is) functions per division.
-- Deleting a division cascades to its as-is functions.
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS as_is_functions (
  id                     UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  division_id            UUID        NOT NULL REFERENCES divisions (id) ON DELETE CASCADE,
  function_name          TEXT,
  manager_count          NUMERIC     DEFAULT 0,
  current_employee_count NUMERIC     DEFAULT 0,
  current_function_hc    NUMERIC     DEFAULT 0,
  current_budget         NUMERIC     DEFAULT 0,
  managers_cost          NUMERIC     DEFAULT 0,
  professionals_cost     NUMERIC     DEFAULT 0,
  target_headcount       NUMERIC,
  target_budget          NUMERIC,
  parent_id              TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ais_division_id ON as_is_functions (division_id);
CREATE INDEX IF NOT EXISTS idx_ais_updated_at  ON as_is_functions (updated_at DESC);

DROP TRIGGER IF EXISTS trg_ais_updated_at ON as_is_functions;
CREATE TRIGGER trg_ais_updated_at
  BEFORE UPDATE ON as_is_functions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ═══════════════════════════════════════════
-- TABLE: landing_box_settings
-- Stores every editable content block on the landing page.
--
-- box_id naming convention (used by script.js):
--   'overview'           — overview title + text
--   'guideline_title'    — ZBOD Guideline section title
--   'gl1' … 'gl7'        — individual guideline items
--   'problems'           — problem statement (JSON array in content)
--   'questions_title'    — Main Questions section title
--   'mq1' … 'mq3'        — individual main question items
--   'quote'              — strategic quote text
--   'strategic_title'    — Strategic Questions section title
--   'sq1' … 'sq2'        — individual strategic question items
--   'fcmatrix'           — function categorisation matrix (JSON in content)
--   'support'            — support functions list (JSON in content)
--   'principles'         — core principles list (JSON in content)
--   'strategic_overview' — strategic overview table (JSON in content)
--   'aaa_cards_<uuid>'   — AAA insight cards per division (JSON array in content)
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS landing_box_settings (
  box_id          TEXT        PRIMARY KEY,
  title           TEXT,
  content         TEXT,
  position_order  INTEGER     DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_landing_updated_at ON landing_box_settings;
CREATE TRIGGER trg_landing_updated_at
  BEFORE UPDATE ON landing_box_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ═══════════════════════════════════════════
-- ROW LEVEL SECURITY
-- Shared public workspace: the anon role may read and write everything.
-- No user authentication is required.
-- ═══════════════════════════════════════════

ALTER TABLE divisions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE workshops            ENABLE ROW LEVEL SECURITY;
ALTER TABLE workshop_functions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE as_is_functions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE landing_box_settings ENABLE ROW LEVEL SECURITY;

-- divisions
DROP POLICY IF EXISTS "anon_select_divisions" ON divisions;
DROP POLICY IF EXISTS "anon_insert_divisions" ON divisions;
DROP POLICY IF EXISTS "anon_update_divisions" ON divisions;
DROP POLICY IF EXISTS "anon_delete_divisions" ON divisions;
CREATE POLICY "anon_select_divisions" ON divisions FOR SELECT USING (true);
CREATE POLICY "anon_insert_divisions" ON divisions FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_divisions" ON divisions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_divisions" ON divisions FOR DELETE USING (true);

-- workshops
DROP POLICY IF EXISTS "anon_select_workshops" ON workshops;
DROP POLICY IF EXISTS "anon_insert_workshops" ON workshops;
DROP POLICY IF EXISTS "anon_update_workshops" ON workshops;
DROP POLICY IF EXISTS "anon_delete_workshops" ON workshops;
CREATE POLICY "anon_select_workshops" ON workshops FOR SELECT USING (true);
CREATE POLICY "anon_insert_workshops" ON workshops FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_workshops" ON workshops FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_workshops" ON workshops FOR DELETE USING (true);

-- workshop_functions
DROP POLICY IF EXISTS "anon_select_wf" ON workshop_functions;
DROP POLICY IF EXISTS "anon_insert_wf" ON workshop_functions;
DROP POLICY IF EXISTS "anon_update_wf" ON workshop_functions;
DROP POLICY IF EXISTS "anon_delete_wf" ON workshop_functions;
CREATE POLICY "anon_select_wf" ON workshop_functions FOR SELECT USING (true);
CREATE POLICY "anon_insert_wf" ON workshop_functions FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_wf" ON workshop_functions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_wf" ON workshop_functions FOR DELETE USING (true);

-- as_is_functions
DROP POLICY IF EXISTS "anon_select_ais" ON as_is_functions;
DROP POLICY IF EXISTS "anon_insert_ais" ON as_is_functions;
DROP POLICY IF EXISTS "anon_update_ais" ON as_is_functions;
DROP POLICY IF EXISTS "anon_delete_ais" ON as_is_functions;
CREATE POLICY "anon_select_ais" ON as_is_functions FOR SELECT USING (true);
CREATE POLICY "anon_insert_ais" ON as_is_functions FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_ais" ON as_is_functions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_ais" ON as_is_functions FOR DELETE USING (true);

-- landing_box_settings
DROP POLICY IF EXISTS "anon_select_landing" ON landing_box_settings;
DROP POLICY IF EXISTS "anon_insert_landing" ON landing_box_settings;
DROP POLICY IF EXISTS "anon_update_landing" ON landing_box_settings;
DROP POLICY IF EXISTS "anon_delete_landing" ON landing_box_settings;
CREATE POLICY "anon_select_landing" ON landing_box_settings FOR SELECT USING (true);
CREATE POLICY "anon_insert_landing" ON landing_box_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_landing" ON landing_box_settings FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_landing" ON landing_box_settings FOR DELETE USING (true);

-- ═══════════════════════════════════════════
-- DONE — all tables, triggers, indexes, and RLS policies created.
-- ═══════════════════════════════════════════



-- ███████████████████████████████████████████████████████████████████
-- HİSSƏ 2 — SONRAKI DÜZƏLİŞLƏR
-- ███████████████████████████████████████████████████████████████████

-- ═══════════════════════════════════════════════════════════════════
-- ZBOD TOOL — Baza düzəlişi (Supabase SQL Editor-da bir dəfə icra edin)
-- Project : (bu faylı hansı Supabase proyektində işə salırsınızsa, ora aiddir)
--
-- NƏ ÜÇÜNDÜR:
-- Tool-un göndərdiyi məlumat sahələri ilə bazadakı sütunlar uyğun gəlmirdi,
-- ona görə strukturlar (divisions) buluda ÜMUMİYYƏTLƏ yazılmırdı — sakitcə
-- xəta verib yalnız brauzerin yaddaşında qalırdı.
--
-- Bu script:
--   1. divisions cədvəlinə çatışmayan sütunları əlavə edir
--   2. Köhnə məcburi (NOT NULL) sütunları isteğe bağlı edir
--   3. workshop_functions-a yeni AS-IS müqayisə sütunlarını əlavə edir
--   4. users cədvəlini yaradır (HRBP / CxO hesabları üçün)
--   5. updated_at trigger-ini düzəldir (aşağıda izah olunur)
--
-- Təhlükəsizdir: mövcud məlumatlar silinmir, yalnız sütun əlavə olunur.
-- Bu fayl tam müstəqil işləyir — əvvəlcə supabase_setup.sql-in işlədilməsinə ehtiyac yoxdur.
-- ═══════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────
-- 0. TƏMƏL: UUID genişlənməsi və updated_at funksiyası
-- (supabase_setup.sql heç işlədilməmiş ola bilər, ona görə bu fayl özü təmin edir)
-- ─────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tool (script.js) hər əlavə/dəyişiklikdə updated_at-i özü göndərir, və brauzerlər arası
-- sinxronizasiya (loadFromSupabase) həmişə "hansı nüsxə daha yenidir" sualını updated_at-ə
-- baxaraq həll edir. Əvvəlki versiya bu sahəni HƏMİŞƏ NOW() ilə əvəz edirdi — yəni "server nə vaxt
-- aldı" ilə "istifadəçi nə vaxt dəyişdi" qarışdırılırdı. Nəticədə: offline redaktə edilib gec
-- sinxronlaşan köhnə dəyişiklik, arada başqa cihazdan edilən əsl yeni dəyişiklikdən "daha yeni"
-- görünə bilər və birləşmə zamanı köhnə məlumat saxlanıla bilərdi. İndi yalnız updated_at heç
-- göndərilməyibsə (NULL olduqda) NOW() işlədilir.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.updated_at IS NULL THEN
    NEW.updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ─────────────────────────────────────────
-- 1. DIVISIONS — çatışmayan sütunlar
-- ─────────────────────────────────────────
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS structure_name       TEXT;
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS c_level_name         TEXT;
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS current_total_hc     NUMERIC;
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS current_total_budget NUMERIC;
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS headcount_target     NUMERIC;
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS budget_target        NUMERIC;

-- Rol sistemi: strukturu kim yaradıb (HRBP) və kimə təyin olunub (CxO)
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS owner_email          TEXT;
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS cxo_email            TEXT;
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS created_by_name      TEXT;
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS created_by_position  TEXT;

-- Köhnə struktur parolu (artıq istifadə olunmur, amma köhnə sətirlərdə qala bilər)
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS division_password_temp TEXT;

-- Köhnə məcburi sütunlar: tool artıq bunları göndərmir, ona görə hər INSERT
-- xəta verirdi. Məcburiyyəti götürürük.
ALTER TABLE divisions ALTER COLUMN name     DROP NOT NULL;
ALTER TABLE divisions ALTER COLUMN password DROP NOT NULL;

-- Mövcud sətirlərdə köhnə "name" sütunundakı dəyəri yeni "structure_name"-ə köçürürük
UPDATE divisions SET structure_name = name WHERE structure_name IS NULL AND name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_divisions_owner_email ON divisions (owner_email);
CREATE INDEX IF NOT EXISTS idx_divisions_cxo_email   ON divisions (cxo_email);


-- ─────────────────────────────────────────
-- 2. WORKSHOP_FUNCTIONS — yeni AS-IS müqayisə sütunları
-- (Phase 3-dəki "As-Is: X" göstəricisi və Dashboard müqayisə cədvəli üçün)
-- ─────────────────────────────────────────
ALTER TABLE workshop_functions ADD COLUMN IF NOT EXISTS as_is_manager_count      NUMERIC;
ALTER TABLE workshop_functions ADD COLUMN IF NOT EXISTS as_is_professional_count NUMERIC;
ALTER TABLE workshop_functions ADD COLUMN IF NOT EXISTS as_is_managers_cost      NUMERIC;
ALTER TABLE workshop_functions ADD COLUMN IF NOT EXISTS as_is_professionals_cost NUMERIC;


-- ─────────────────────────────────────────
-- 3. USERS — HRBP / CxO hesabları
-- Əvvəl yalnız brauzerin yaddaşında idi, ona görə Admin bir kompüterdə hesab
-- yaradanda həmin şəxs başqa kompüterdən daxil ola bilmirdi.
-- ─────────────────────────────────────────
-- Sütun adları tool-un göndərdiyi adlarla HƏRFBƏHƏRF eyni olmalıdır,
-- ona görə camelCase adlar dırnaq içindədir.
CREATE TABLE IF NOT EXISTS users (
  id                     UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  role                   TEXT,                 -- 'hrbp' | 'cxo'
  "fullName"             TEXT,
  position               TEXT,
  "areaOfResponsibility" TEXT,
  email                  TEXT,
  password               TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (lower(email));

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_users" ON users;
DROP POLICY IF EXISTS "anon_insert_users" ON users;
DROP POLICY IF EXISTS "anon_update_users" ON users;
DROP POLICY IF EXISTS "anon_delete_users" ON users;
CREATE POLICY "anon_select_users" ON users FOR SELECT USING (true);
CREATE POLICY "anon_insert_users" ON users FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_users" ON users FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_users" ON users FOR DELETE USING (true);


-- PostgREST (Supabase-in API qatı) sxem keşini dərhal yeniləsin — əks halda yeni users cədvəli
-- və yeni sütunlar bir neçə dəqiqə (default keş müddəti bitənə qədər) API-də görünməyə bilər.
NOTIFY pgrst, 'reload schema';


-- ═══════════════════════════════════════════
-- HAZIRDIR
--
-- ⚠️  DİQQƏT — TƏHLÜKƏSİZLİK:
-- Yuxarıdakı RLS qaydaları (və bütün digər cədvəllərdəkilər) hər kəsə —
-- yəni proqramın açarını bilən istənilən şəxsə — bütün məlumatları oxumaq,
-- dəyişmək və silmək icazəsi verir. Bura istifadəçi parolları da daxildir.
--
-- Bu, yalnız daxili (şirkətdaxili) istifadə üçün müvəqqəti qəbul edilə bilər.
-- Əsl həll: Supabase Auth qurmaq və RLS qaydalarını auth.uid()-ə bağlamaq.
-- ═══════════════════════════════════════════
