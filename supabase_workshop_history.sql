-- ═══════════════════════════════════════════════════════════════════
-- ZBOD TOOL — Workshop tarixçəsi: AS-IS surəti və versiyalar
--
-- Supabase → SQL Editor → hamısını yapışdırın → Run. Təkrar işə salmaq təhlükəsizdir.
--
-- Nə edir:
--  1. as_is_snapshot: tamamlanmış workshop (və AS-IS Baseline workshop-u kopyalandığı andan)
--     müqayisə etdiyi AS-IS-in surətini saxlayır. Strukturun AS-IS məlumatı sonradan yenidən
--     yüklənəndə və ya dəyişəndə köhnə workshop-un AS-IS tərəfi, qənaəti və Excel hesabatı dəyişmir.
--  2. based_on_workshop_id: History-də "Edit as new version" ilə başlanan workshop-un hansı
--     tamamlanmış workshop-un surəti olduğunu saxlayır ("Version of Workshop #..." yazısı).
--     Əsas workshop silinsə bu sahə boşalır, versiyanın özü qalır.
--  Sütunlar workshops cədvəlindədir, ona görə görünmə qaydası (RLS) workshop-un özü ilə eynidir.
--
--  Bu SQL icra edilməyibsə proqram işləyir, amma bu iki məlumat buludda saxlanmır və
--  "Bazada sütun çatışmır" xəbərdarlığı görünür.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE workshops ADD COLUMN IF NOT EXISTS as_is_snapshot JSONB;
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS based_on_workshop_id UUID REFERENCES workshops (id) ON DELETE SET NULL;
