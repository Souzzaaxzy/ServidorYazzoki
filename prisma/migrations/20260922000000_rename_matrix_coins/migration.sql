-- Rebrand: the gamification coin table follows the product name.
-- Purely a rename — no column or constraint changes, so existing rows and
-- the cached balances are preserved.
ALTER TABLE "matrix_coins" RENAME TO "yazzoki_coins";
