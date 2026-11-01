-- Profile views ("quem entrou no meu perfil").
--
-- One row per (viewer, profile) pair: re-opening a profile UPDATES the
-- timestamp instead of inserting again, so the list is "last seen per
-- visitor" (bounded, and the app shows "há N minutos/dias").
--
-- PRIVACY: read ONLY by the profile owner (the API enforces it). There is no
-- way for another user to learn who visited someone else's profile.
CREATE TABLE "profile_views" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "viewerId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "viewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "profile_views_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "profile_views_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "profile_views_viewerId_profileId_key" ON "profile_views"("viewerId", "profileId");
CREATE INDEX "profile_views_profileId_viewedAt_idx" ON "profile_views"("profileId", "viewedAt");
