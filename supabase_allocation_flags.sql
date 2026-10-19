-- ═══════════════════════════════════════════════════════════════════
-- ZBOD TOOL — Phase 3 paylama bayraqları
--
-- Bu faylı Supabase SQL Editor-da bir dəfə icra edin.
-- Təkrar işə salmaq təhlükəsizdir (IF NOT EXISTS).
--
-- NƏYƏ LAZIMDIR:
-- Analyze AS-IS workshopunda Proposed HC və Proposed Cost iki mənbədən
-- gələ bilər — ya AS-IS-dən yüklənmiş real rəqəmdən, ya da istifadəçinin
-- öz əli ilə yazdığı faizdən/məbləğdən. Proqram bu ikisini fərqləndirmək
-- üçün hər funksiyada iki bayraq saxlayır.
--
-- Bu sütunlar olmadan bayraqlar buluda getmir və başqa kompüterdə
-- açanda əl ilə yazılmış rəqəm AS-IS bazasına qayıdır.
-- ═══════════════════════════════════════════════════════════════════


ALTER TABLE workshop_functions
  ADD COLUMN IF NOT EXISTS proposed_budget_manual       BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hc_allocation_percent_manual BOOLEAN DEFAULT FALSE;


-- Mövcud sətirlərdə NULL qalmasın (köhnə qeydlər üçün).
UPDATE workshop_functions
   SET proposed_budget_manual = COALESCE(proposed_budget_manual, FALSE),
       hc_allocation_percent_manual = COALESCE(hc_allocation_percent_manual, FALSE)
 WHERE proposed_budget_manual IS NULL
    OR hc_allocation_percent_manual IS NULL;


INSERT INTO schema_migrations (filename, note)
VALUES ('supabase_allocation_flags.sql',
        'workshop_functions: proposed_budget_manual + hc_allocation_percent_manual')
ON CONFLICT (filename) DO NOTHING;


NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════
-- HAZIRDIR
--
-- Yoxlamaq üçün:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'workshop_functions' AND column_name LIKE '%_manual';
-- İki sətir qayıtmalıdır.
-- ═══════════════════════════════════════════
