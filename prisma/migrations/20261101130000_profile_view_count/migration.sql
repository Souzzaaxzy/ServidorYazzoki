-- The visitor counter: how many times each user opened this profile.
-- The existing rows keep 1 (they represent one recorded visit each).
ALTER TABLE "profile_views" ADD COLUMN "views" INTEGER NOT NULL DEFAULT 1;
