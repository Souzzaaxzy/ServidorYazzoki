-- Media messages gain: a caption, the VIEW-ONCE rule, and ALBUMS.
-- `content` keeps holding the stable preview label ("📷 Foto") so the chat
-- list never shows a long caption.

ALTER TABLE "messages" ADD COLUMN "caption" TEXT;
ALTER TABLE "messages" ADD COLUMN "viewOnce" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "messages" ADD COLUMN "viewedAt" DATETIME;
ALTER TABLE "messages" ADD COLUMN "albumId" TEXT;

-- One row per file of an ALBUM message (2–10 media in one message).
CREATE TABLE "album_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "album_items_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "album_items_messageId_position_key" ON "album_items"("messageId", "position");
CREATE INDEX "album_items_messageId_idx" ON "album_items"("messageId");

-- Per-user record of WHO opened a view-once message. A group needs this:
-- one member opening the media must not consume it for the others.
CREATE TABLE "message_view_once_opens" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "message_view_once_opens_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "message_view_once_opens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "message_view_once_opens_messageId_userId_key" ON "message_view_once_opens"("messageId", "userId");
CREATE INDEX "message_view_once_opens_messageId_idx" ON "message_view_once_opens"("messageId");
