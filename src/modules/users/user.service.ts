import { prisma } from '../../config/prisma.js';
import { ApiError, toApiError } from '../../utils/errors.js';
import { nicknameKey, normalizeNickname } from '../../utils/normalize.js';
import { parsePublicId, PUBLIC_ID_DIGITS } from '../../utils/public-id.js';
import { isValidThemeId } from '../../utils/themes.js';
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
          reposts: {
            orderBy: { createdAt: 'desc' },
            take: 3,
            select: {
              userId: true,
              createdAt: true,
              user: { select: AUTHOR_SELECT },
            },
          },
          ...(currentUserId
            ? { likes: { where: { userId: currentUserId }, select: { userId: true } } }
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
  const repostsCount = await prisma.repost.count({ where: { userId: user.id } });
  // The follow state is only meaningful for an authenticated viewer looking
  // at someone else's profile — the APK never asks for its own.
  let follow: FollowState | null = null;
  if (currentUserId && currentUserId !== user.id) {
    follow = await getFollowState(currentUserId, user.id);
  }
  // Which of this user's posts the VIEWER reposted (one query, no N+1).
  const viewerRepostedIds = currentUserId
    ? new Set(
        (
          await prisma.repost.findMany({
            where: {
              userId: currentUserId,
              postId: { in: user.posts.map((p) => p.id) },
            },
            select: { postId: true },
          })
        ).map((r) => r.postId),
      )
    : new Set<string>();
  return {
    user: toProfileUser(user, { ...counts, postsCount, repostsCount }),
    posts: user.posts.map((p) =>
      toFeedPost(p, currentUserId, viewerRepostedIds.has(p.id)),
    ),
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
    publicId: string | number | null;
    profileThemeId: string | null;
  }>,
): Promise<AuthUser> {
  try {
    const data: Record<string, unknown> = {};
    // Changing the public `#id`: the user picks the number they want. It must
    // still be a positive integer and UNIQUE (another account may already own
    // it) — checked here so the user gets a clear message instead of a raw
    // database constraint error.
    if (input.publicId !== undefined && input.publicId !== null) {
      const wanted = parsePublicId(String(input.publicId));
      if (wanted === null) {
        throw ApiError.validation('ID inválido. Use apenas números.');
      }
      if (String(wanted).length > PUBLIC_ID_DIGITS) {
        throw ApiError.validation(
          `O ID deve ter no máximo ${PUBLIC_ID_DIGITS} dígitos.`,
        );
      }
      const owner = await prisma.user.findUnique({
        where: { publicId: wanted },
        select: { id: true },
      });
      if (owner && owner.id !== userId) {
        throw ApiError.conflict('Este ID já está em uso. Escolha outro.');
      }
      data.publicId = wanted;
    }
    if (input.nickname !== undefined) {
      data.nickname = normalizeNickname(input.nickname);
      data.nicknameKey = nicknameKey(input.nickname);
    }
    if (input.bio !== undefined) data.bio = input.bio ?? '';
    if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl;
    // `null` clears the banner (back to the default cover); `undefined`
    // leaves it untouched — same contract as avatarUrl.
    if (input.bannerUrl !== undefined) data.bannerUrl = input.bannerUrl;
    // Published profile theme. WHITELIST: only catalog ids (or '' to clear)
    // are stored — an unknown id would leave the app without a palette.
    if (input.profileThemeId !== undefined) {
      const theme = (input.profileThemeId ?? '').trim();
      if (!isValidThemeId(theme)) {
        throw ApiError.validation('Tema desconhecido.');
      }
      data.profileThemeId = theme === '' ? null : theme;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data,
    });
    return toAuthUser(user);
  } catch (err) {
    throw toApiError(err);
  }
}
