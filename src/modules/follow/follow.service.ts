import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../utils/errors.js';
import { AUTHOR_SELECT, toPublicUser, type PublicUser } from '../../utils/dto.js';
import { FollowState, NotificationType } from '../../types/enums.js';
import { dispatchNotification } from '../push/push.service.js';

// ── Follow graph (Instagram model) ───────────────────────────
// A follow is a DIRECTED edge (followerId → followingId). There is no
// approval step: following is instant and one-directional. "Seguir de
// volta" is simply the reverse edge, so it is just another follow call.
//
// Chat and groups gate on `canInteract` (EITHER side follows the other),
// which replaces the old mutual-friendship requirement.

export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  const row = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId, followingId } },
    select: { id: true },
  });
  return row !== null;
}

/**
 * True when the two users may interact privately (DM, add to group): at
 * least one of them follows the other. This keeps some spam control while
 * remaining far more open than the old friends-only rule.
 */
export async function canInteract(a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  const row = await prisma.follow.findFirst({
    where: {
      OR: [
        { followerId: a, followingId: b },
        { followerId: b, followingId: a },
      ],
    },
    select: { id: true },
  });
  return row !== null;
}

/** Kept as the old name so callers (chat/groups) keep working unchanged. */
export const areFriends = canInteract;

/** The viewer's relationship to [otherId] — drives the profile buttons. */
export async function getFollowState(viewerId: string, otherId: string): Promise<FollowState> {
  if (viewerId === otherId) return FollowState.NONE;
  const [following, followsYou] = await prisma.$transaction([
    prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: viewerId, followingId: otherId } },
      select: { id: true },
    }),
    prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: otherId, followingId: viewerId } },
      select: { id: true },
    }),
  ]);
  const iFollow = following !== null;
  const theyFollow = followsYou !== null;
  if (iFollow && theyFollow) return FollowState.MUTUAL;
  if (iFollow) return FollowState.FOLLOWING;
  if (theyFollow) return FollowState.FOLLOWS_YOU;
  return FollowState.NONE;
}

/** Follows [targetId]. Idempotent: following twice is a no-op, not an error. */
export async function followUser(followerId: string, targetId: string): Promise<void> {
  if (followerId === targetId) {
    throw ApiError.invalidRequest('Você não pode seguir a si mesmo.');
  }
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true },
  });
  if (!target) throw ApiError.notFound('Usuário não encontrado.');

  const existing = await isFollowing(followerId, targetId);
  if (existing) return; // already following — idempotent

  await prisma.follow.create({ data: { followerId, followingId: targetId } });

  // Notify the followed user (deduped by the notification id in the push hub).
  const note = await prisma.notification.create({
    data: {
      recipientId: targetId,
      actorId: followerId,
      type: NotificationType.FOLLOW,
    },
  });
  await dispatchNotification(targetId, note).catch(() => void 0);
}

/** Unfollows [targetId]. Idempotent: unfollowing when not following is a no-op. */
export async function unfollowUser(followerId: string, targetId: string): Promise<void> {
  if (followerId === targetId) {
    throw ApiError.invalidRequest('Operação inválida.');
  }
  await prisma.follow.deleteMany({ where: { followerId, followingId: targetId } });
  // Drop any pending FOLLOW notification between the pair so a stale
  // "começou a seguir você" card never lingers after an unfollow.
  await prisma.notification.deleteMany({
    where: {
      recipientId: targetId,
      actorId: followerId,
      type: NotificationType.FOLLOW,
    },
  });
}

export interface UsersPage {
  users: PublicUser[];
  total: number;
  page: number;
  pageSize: number;
}

const USER_SELECT = { ...AUTHOR_SELECT, bio: true, createdAt: true } as const;

function clampPage(page: number, pageSize: number): { page: number; pageSize: number } {
  return {
    page: Math.max(1, page),
    pageSize: Math.min(Math.max(1, pageSize), 50),
  };
}

/** Users that [userId] FOLLOWS (their "Seguindo" list). */
export async function listFollowing(
  userId: string,
  page: number,
  pageSize: number,
): Promise<UsersPage> {
  const p = clampPage(page, pageSize);
  const [total, rows] = await prisma.$transaction([
    prisma.follow.count({ where: { followerId: userId } }),
    prisma.follow.findMany({
      where: { followerId: userId },
      orderBy: { createdAt: 'desc' },
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
      include: { following: { select: USER_SELECT } },
    }),
  ]);
  return {
    users: rows.map((r) => toPublicUser(r.following)),
    total,
    page: p.page,
    pageSize: p.pageSize,
  };
}

/** Users that FOLLOW [userId] (their "Seguidores" list). */
export async function listFollowers(
  userId: string,
  page: number,
  pageSize: number,
): Promise<UsersPage> {
  const p = clampPage(page, pageSize);
  const [total, rows] = await prisma.$transaction([
    prisma.follow.count({ where: { followingId: userId } }),
    prisma.follow.findMany({
      where: { followingId: userId },
      orderBy: { createdAt: 'desc' },
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
      include: { follower: { select: USER_SELECT } },
    }),
  ]);
  return {
    users: rows.map((r) => toPublicUser(r.follower)),
    total,
    page: p.page,
    pageSize: p.pageSize,
  };
}

/** Real counters for a profile: followers, following and total likes. */
export async function followCounts(userId: string): Promise<{
  followersCount: number;
  followingCount: number;
  likesCount: number;
}> {
  const [followersCount, followingCount, likesCount] = await prisma.$transaction([
    prisma.follow.count({ where: { followingId: userId } }),
    prisma.follow.count({ where: { followerId: userId } }),
    // Total likes across ALL of the user's posts (sum of per-post likes).
    prisma.like.count({ where: { post: { userId } } }),
  ]);
  return { followersCount, followingCount, likesCount };
}
