-- Rebrand/social: replace the mutual "friendship" model with the
-- Instagram-style DIRECTED follow graph.
--
-- Existing data is preserved: every accepted friendship becomes TWO follows
-- (A→B and B→A), so current friends keep mutual access (chat/groups gate on
-- "either side follows the other"). Pending/rejected friend requests are
-- dropped — the follow model has no approval step.

-- CreateTable
CREATE TABLE "follows" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "follows_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "follows_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "follows_followerId_followingId_key" ON "follows"("followerId", "followingId");
CREATE INDEX "follows_followingId_idx" ON "follows"("followingId");
CREATE INDEX "follows_followerId_idx" ON "follows"("followerId");

-- Migrate accepted friendships into mutual follows (both directions).
INSERT INTO "follows" ("id", "followerId", "followingId", "createdAt")
SELECT 'f1_' || "userOneId" || '_' || "userTwoId", "userOneId", "userTwoId", "createdAt"
FROM "friendships";

INSERT INTO "follows" ("id", "followerId", "followingId", "createdAt")
SELECT 'f2_' || "userTwoId" || '_' || "userOneId", "userTwoId", "userOneId", "createdAt"
FROM "friendships";

-- Drop the old social tables. notifications.friendRequestId is removed in
-- the same rebuild below, so the FK no longer dangles.
DROP TABLE "friendships";
DROP TABLE "friend_requests";

-- RedefineTables (notifications: drop friendRequestId + its FK)
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipientId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "notifications_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_notifications" ("actorId", "commentId", "createdAt", "id", "postId", "read", "recipientId", "type")
SELECT "actorId", "commentId", "createdAt", "id", "postId", "read", "recipientId", "type" FROM "notifications";
DROP TABLE "notifications";
ALTER TABLE "new_notifications" RENAME TO "notifications";
CREATE INDEX "notifications_recipientId_read_idx" ON "notifications"("recipientId", "read");
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
