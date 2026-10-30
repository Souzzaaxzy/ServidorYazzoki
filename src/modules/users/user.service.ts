import { prisma } from '../../config/prisma.js';
import { ApiError, toApiError } from '../../utils/errors.js';
import { nicknameKey, normalizeNickname } from '../../utils/normalize.js';
import { parsePublicId } from '../../utils/public-id.js';
import { AUTHOR_SELECT, toAuthUser, toFeedPost, toProfileUser, type AuthUser, type FeedPost, type ProfileUser } from '../../utils/dto.js';
import { followCounts, getFollowState } from '../follow/follow.service.js';
import type { FollowState } from '../../types/enums.js';

export async function getProfile(
  nickname: string,
  currentUserId?: string,
): Promise<{ user: ProfileUser; posts: FeedPost[]; follow: FollowState | null }> {
  // The profile resolves by nickname (case-insensitively, through the
  // nickname key) OR by the public `#id` (e.g. `#00000001`) — so a profile
  // can be opened straight from an id shown anywhere in the app.
  const publicId = parsePublicId(nickname);
  const user = await prisma.user.findFirst({
    where:
      publicId !== null
        ? { publicId }
        : { nicknameKey: nicknameKey(nickname) },
    include: {
      // The pinned profile song (one row, or none) rides along so the screen
      // renders the play button without a second request.
      profileMusic: true,
      posts: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          user: { select: AUTHOR_SELECT },
          _count: { select: { likes: true, comments: true, reposts: true } },
          ...(currentUserId
            ? {
                likes: { where: { userId: currentUserId }, select: { userId: true } },
                reposts: { where: { userId: currentUserId }, select: { userId: true } },
              }
            : {}),
        },
      },
    },
  });
  if (!user) throw ApiError.notFound('Usuário não encontrado.');
  // Real counters: postsCount = all posts of this user; the social counters
  // (followers / following / total likes) come from the follow graph.
  const postsCount = await prisma.post.count({ where: { userId: user.id } });
  const counts = await followCounts(user.id);
  // The follow state is only meaningful for an authenticated viewer looking
  // at someone else's profile — the APK never asks for its own.
  let follow: FollowState | null = null;
  if (currentUserId && currentUserId !== user.id) {
    follow = await getFollowState(currentUserId, user.id);
  }
  return {
    user: toProfileUser(user, { ...counts, postsCount }),
    posts: user.posts.map((p) => toFeedPost(p, currentUserId)),
    follow,
  };
}

export async function updateProfile(
  userId: string,
  input: Partial<{
    nickname: string;
    bio: string | null;
    avatarUrl: string | null;
    bannerUrl: string | null;
  }>,
): Promise<AuthUser> {
  try {
    const data: Record<string, unknown> = {};
    if (input.nickname !== undefined) {
      data.nickname = normalizeNickname(input.nickname);
      data.nicknameKey = nicknameKey(input.nickname);
    }
    if (input.bio !== undefined) data.bio = input.bio ?? '';
    if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl;
    // `null` clears the banner (back to the default cover); `undefined`
    // leaves it untouched — same contract as avatarUrl.
    if (input.bannerUrl !== undefined) data.bannerUrl = input.bannerUrl;

    const user = await prisma.user.update({
      where: { id: userId },
      data,
    });
    return toAuthUser(user);
  } catch (err) {
    throw toApiError(err);
  }
}
