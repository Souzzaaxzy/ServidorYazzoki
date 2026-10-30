-- Reposts (Instagram/TikTok style "share to profile") for POSTS and STORIES.
--
-- * reposts: one row per (user, post) — the toggle deletes/creates it, so the
--   button state is derived from its presence. A reference, never a copy.
-- * story_reposts: publishes a COPY of a story into the reposter's strip
--   (it expires with the original) while remembering the ORIGINAL story.
-- * notifications.storyId: lets a STORY_REPOST notification point at a story.

-- CreateTable
CREATE TABLE "reposts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reposts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "reposts_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "reposts_postId_idx" ON "reposts"("postId");
CREATE INDEX "reposts_userId_createdAt_idx" ON "reposts"("userId", "createdAt");
CREATE UNIQUE INDEX "reposts_userId_postId_key" ON "reposts"("userId", "postId");

-- CreateTable
CREATE TABLE "story_reposts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "originalStoryId" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "story_reposts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "story_reposts_originalStoryId_fkey" FOREIGN KEY ("originalStoryId") REFERENCES "stories" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "story_reposts_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "stories" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "story_reposts_storyId_key" ON "story_reposts"("storyId");
CREATE INDEX "story_reposts_originalStoryId_idx" ON "story_reposts"("originalStoryId");
CREATE UNIQUE INDEX "story_reposts_userId_originalStoryId_key" ON "story_reposts"("userId", "originalStoryId");

-- AlterTable: notifications gains the optional story reference
ALTER TABLE "notifications" ADD COLUMN "storyId" TEXT;
