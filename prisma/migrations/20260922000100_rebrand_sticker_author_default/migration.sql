-- Rebrand: the default sticker-package author follows the product name.
-- Rewrites the table so the schema default and the migration history agree
-- (the previous default 'MATRIX' came from the original stickers migration).
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_sticker_packages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "author" TEXT NOT NULL DEFAULT 'Yazzoki',
    "iconUrl" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "authorId" TEXT,
    "source" TEXT,
    "sourceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_sticker_packages" ("active", "author", "authorId", "createdAt", "description", "iconUrl", "id", "name", "slug", "source", "sourceId", "updatedAt") SELECT "active", "author", "authorId", "createdAt", "description", "iconUrl", "id", "name", "slug", "source", "sourceId", "updatedAt" FROM "sticker_packages";
DROP TABLE "sticker_packages";
ALTER TABLE "new_sticker_packages" RENAME TO "sticker_packages";
CREATE UNIQUE INDEX "sticker_packages_slug_key" ON "sticker_packages"("slug");
CREATE INDEX "sticker_packages_active_idx" ON "sticker_packages"("active");
CREATE INDEX "sticker_packages_authorId_idx" ON "sticker_packages"("authorId");
CREATE INDEX "sticker_packages_source_sourceId_idx" ON "sticker_packages"("source", "sourceId");
