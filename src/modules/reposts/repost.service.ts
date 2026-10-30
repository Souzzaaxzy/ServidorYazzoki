import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../utils/errors.js';
import { AUTHOR_SELECT, toFeedPost, type FeedPost } from '../../utils/dto.js';
import { NotificationType } from '../../types/enums.js';
import { dispatchNotification } from '../push/push.service.js';

// ── Reposts (posts) ──────────────────────────────────────────
// Instagram/TikTok "share to profile": the repost is a REFERENCE to the
// original post (never a copy), so the original stays the single source of
// truth and a delete cascades. One repost per (user, post) — the button is a
// TOGGLE derived from the row's presence.
//
// Anti-spam: a short cooldown per (user, post) blocks rapid toggling of the
// SAME post (which would otherwise create/delete rows and notifications in a
// loop). The cooldown is SERVER-side (the client can never lift it).

/** Minimum gap between two repost toggles of the SAME post by the SAME user. */
export const REPOST_COOLDOWN_MS = 5_000;

const FEED_INCLUDE = {
  user: { select: AUTHOR_SELECT },
  _count: { select: { likes: true, comments: { where: { deletedAt: null } } } },
} as const;

// Anti-spam throttle, in memory: the key is `user:post` and the value is the
// last time that user REPOSTED (not un-reposted) that post. Kept in memory on
// purpose — it is a short-lived guard, not persisted state; a restart simply
// clears it. Undoing is NEVER throttled (the user must be able to tap the
// active button to remove it), only rapid RE-reposting of the same post.
const lastRepostAt = new Map<string, number>();

function throttleKey(userId: string, postId: string): string {
  return `${userId}:${postId}`;
}

/** Rejects a RE-repost that arrives sooner than REPOST_COOLDOWN_MS. */
function assertNotThrottled(userId: string, postId: string): void {
  const last = lastRepostAt.get(throttleKey(userId, postId));
  if (last !== undefined && Date.now() - last < REPOST_COOLDOWN_MS) {
    throw ApiError.rateLimited(
      'Calma aí! Aguarde alguns segundos antes de repostar de novo.',
    );
  }
}

/**
 * Toggles the session user's repost of a post. Returns the resulting state
 * (`reposted`) plus the updated repost count so the UI can reconcile.
 */
export async function toggleRepost(
  userId: string,
  postId: string,
): Promise<{ reposted: boolean; repostCount: number }> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, userId: true },
  });
  if (!post) throw ApiError.notFound('Publicação não encontrada.');

  const existing = await prisma.repost.findUnique({
    where: { userId_postId: { userId, postId } },
    select: { id: true },
  });

  if (existing) {
    await prisma.repost.delete({ where: { id: existing.id } });
    // An undone repost removes its notification so it never lingers.
    await prisma.notification.deleteMany({
      where: {
        recipientId: post.userId,
        actorId: userId,
        type: NotificationType.REPOST,
        postId,
      },
    });
  } else {
    // Throttle ONLY the create side: undoing must always be immediate.
    assertNotThrottled(userId, postId);
    await prisma.repost.create({ data: { userId, postId } });
    lastRepostAt.set(throttleKey(userId, postId), Date.now());
    // Never notify yourself for reposting your own post.
    if (post.userId !== userId) {
      const note = await prisma.notification.create({
        data: {
          recipientId: post.userId,
          actorId: userId,
          type: NotificationType.REPOST,
          postId,
        },
      });
      await dispatchNotification(post.userId, note).catch(() => void 0);
    }
  }

  const repostCount = await prisma.repost.count({ where: { postId } });
  return { reposted: !existing, repostCount };
}

/** Whether [userId] reposted [postId] (drives the button's active state). */
export async function isReposted(userId: string, postId: string): Promise<boolean> {
  const row = await prisma.repost.findUnique({
    where: { userId_postId: { userId, postId } },
    select: { id: true },
  });
  return row !== null;
}

export interface RepostsPage {
  posts: FeedPost[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * A user's REPOSTS, newest first, as feed posts (the original post, marked
 * `reposted: true`). Powers the profile "Reposts" tab. Same query backs the
 * tab's counter, so the list and the number never diverge.
 */
export async function listReposts(
  userId: string,
  viewerId: string | undefined,
  page: number,
  pageSize: number,
): Promise<RepostsPage> {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(Math.max(1, pageSize), 50);
  const [total, rows] = await prisma.$transaction([
    prisma.repost.count({ where: { userId } }),
    prisma.repost.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (safePage - 1) * safeSize,
      take: safeSize,
      include: {
        post: {
          include: {
            ...FEED_INCLUDE,
            ...(viewerId
              ? { likes: { where: { userId: viewerId }, select: { userId: true } } }
              : {}),
          },
        },
      },
    }),
  ]);
  return {
    posts: rows.map((r) => ({
      ...toFeedPost(r.post, viewerId),
      reposted: true,
      repostCount: 0,
    })),
    total,
    page: safePage,
    pageSize: safeSize,
  };
}

/** Repost count of one post (used by the post payload). */
export async function repostCount(postId: string): Promise<number> {
  return prisma.repost.count({ where: { postId } });
}
