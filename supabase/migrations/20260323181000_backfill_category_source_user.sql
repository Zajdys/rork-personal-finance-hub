-- Opravný backfill category_source = 'user' pro shodu s user_category_rules.
-- JS ekvivalent: bun scripts/backfill-category-source-user.bun.ts
-- (merchant_key matching vyžaduje normalizeMerchantKey — spouštět skriptem výše)
--
-- Tato migrace je placeholder / dokumentace; reálný backfill běží skriptem
-- před CATEGORIZATION_VERSION 3.
SELECT 1;
