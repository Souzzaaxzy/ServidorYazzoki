import { prisma } from '../../config/prisma.js';
import { ApiError } from '../../utils/errors.js';
import { AUTHOR_SELECT, toPublicUser, type PublicUser } from '../../utils/dto.js';

// ── Profile views ("quem entrou no meu perfil") ──────────────
// PRIVACY MODEL: the list is keyed by the PROFILE OWNER. A row is written
// when someone opens another user's profile; re-opening UPDATES `viewedAt`
// (one row per visitor, "last seen"). ONLY the owner can read the list —
// there is no route that exposes another user's visitors.

export interface ProfileViewItem {
  user: PublicUser;
  viewedAt: string;
}

export interface ProfileViewsPage {
  views: ProfileViewItem[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Records that [viewerId] opened [profileId]'s profile. Idempotent by pair:
 * the timestamp is refreshed. Never records a self-view (the owner opening
 * their own profile) — that is not a "visit".
 */
export async function recordProfileView(
  viewerId: string,
  profileId: string,
): Promise<void> {
  if (viewerId === profileId) return;
  const target = await prisma.user.findUnique({
    where: { id: profileId },
    select: { id: true },
  });
  if (!target) throw ApiError.notFound('Usuário não encontrado.');
  await prisma.profileView.upsert({
    where: { viewerId_profileId: { viewerId, profileId } },
    update: { viewedAt: new Date() },
    create: { viewerId, profileId },
  });
}

/**
 * The visitors of [ownerId]'s profile, most recent first. Authorization is
 * enforced SERVER-SIDE: the caller must BE the owner.
 */
export async function listProfileViews(
  ownerId: string,
  requesterId: string,
  page: number,
  pageSize: number,
): Promise<ProfileViewsPage> {
  if (ownerId !== requesterId) {
    throw ApiError.forbidden('Você só pode ver quem visitou o SEU perfil.');
  }
  const safePage = Math.max(1, page);
  const safeSize = Math.min(Math.max(1, pageSize), 50);
  const [total, rows] = await prisma.$transaction([
    prisma.profileView.count({ where: { profileId: ownerId } }),
    prisma.profileView.findMany({
      where: { profileId: ownerId },
      orderBy: { viewedAt: 'desc' },
      skip: (safePage - 1) * safeSize,
      take: safeSize,
      include: { viewer: { select: { ...AUTHOR_SELECT, bio: true, createdAt: true } } },
    }),
  ]);
  return {
    views: rows.map((r) => ({
      user: toPublicUser(r.viewer),
      viewedAt: r.viewedAt.toISOString(),
    })),
    total,
    page: safePage,
    pageSize: safeSize,
  };
}

/** How many people visited the owner's profile (badge counter). */
export async function profileViewsCount(ownerId: string): Promise<number> {
  return prisma.profileView.count({ where: { profileId: ownerId } });
}
