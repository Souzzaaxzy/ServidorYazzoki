// Application-level enum definitions.
//
// Prisma's SQLite connector does not support `enum` types, so the schema
// stores these as plain strings. To keep the rest of the codebase unchanged
// (it references e.g. `XpReason.POST_CREATED` as both a value and a type),
// we define them here as const objects with derived union types and
// re-export them from the modules that previously re-exported the generated
// Prisma enums. The string values MUST match the defaults used in
// prisma/schema.prisma exactly.

export const UserRole = {
  USER: 'USER',
  MODERATOR: 'MODERATOR',
  ADMIN: 'ADMIN',
  OWNER: 'OWNER',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

// Follow relationship as seen by the viewer on another user's profile.
// The Instagram model has no approval step: either you follow them or not.
export const FollowState = {
  NONE: 'NONE',
  /** Viewer follows the profile owner. */
  FOLLOWING: 'FOLLOWING',
  /** Profile owner follows the viewer, but not the other way around. */
  FOLLOWS_YOU: 'FOLLOWS_YOU',
  /** Both directions — the "Seguindo" state with a "Seguir de volta" hint. */
  MUTUAL: 'MUTUAL',
} as const;
export type FollowState = (typeof FollowState)[keyof typeof FollowState];

export const NotificationType = {
  LIKE: 'LIKE',
  COMMENT: 'COMMENT',
  FOLLOW: 'FOLLOW',
} as const;
export type NotificationType =
  (typeof NotificationType)[keyof typeof NotificationType];

export const XpReason = {
  POST_CREATED: 'POST_CREATED',
  COMMENT_CREATED: 'COMMENT_CREATED',
  COMMENT_RECEIVED: 'COMMENT_RECEIVED',
  LIKE_RECEIVED: 'LIKE_RECEIVED',
  ACHIEVEMENT: 'ACHIEVEMENT',
  EVENT_REWARD: 'EVENT_REWARD',
  GAME_REWARD: 'GAME_REWARD',
  ADMIN_GRANT: 'ADMIN_GRANT',
} as const;
export type XpReason = (typeof XpReason)[keyof typeof XpReason];

export const CoinReason = {
  POST_CREATED: 'POST_CREATED',
  ACHIEVEMENT: 'ACHIEVEMENT',
  EVENT_REWARD: 'EVENT_REWARD',
  GAME_REWARD: 'GAME_REWARD',
  ADMIN_GRANT: 'ADMIN_GRANT',
  ADMIN_REMOVE: 'ADMIN_REMOVE',
  PURCHASE: 'PURCHASE',
  REWARD: 'REWARD',
} as const;
export type CoinReason = (typeof CoinReason)[keyof typeof CoinReason];

export const CoinTransactionType = {
  EARN: 'EARN',
  SPEND: 'SPEND',
  ADMIN_GRANT: 'ADMIN_GRANT',
  ADMIN_REMOVE: 'ADMIN_REMOVE',
  REWARD: 'REWARD',
} as const;
export type CoinTransactionType =
  (typeof CoinTransactionType)[keyof typeof CoinTransactionType];

export const EventStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  ENDED: 'ENDED',
  CANCELLED: 'CANCELLED',
} as const;
export type EventStatus = (typeof EventStatus)[keyof typeof EventStatus];

export const MusicVoteDirection = {
  UP: 'UP',
  DOWN: 'DOWN',
} as const;
export type MusicVoteDirection =
  (typeof MusicVoteDirection)[keyof typeof MusicVoteDirection];
