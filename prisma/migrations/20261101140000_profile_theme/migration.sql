-- The theme a user publishes on their profile (shown to OTHER users).
-- A catalog slug (e.g. 'sakura'), validated against a whitelist by the API;
-- NULL/'' means "use the viewer's own theme".
ALTER TABLE "users" ADD COLUMN "profileThemeId" TEXT;
