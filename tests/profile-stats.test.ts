import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestServer, closeTestServer, createAndLoginUser } from './helpers.js';
import { prisma } from '../src/config/prisma.js';
import type { FastifyInstance } from 'fastify';

let server: FastifyInstance;

beforeAll(async () => {
  server = await buildTestServer();
});
afterAll(async () => {
  await closeTestServer();
});

async function followReq(token: string, id: string) {
  return server.inject({
    method: 'POST',
    url: `/api/users/${id}/follow`,
    headers: { authorization: `Bearer ${token}` },
  });
}

async function profileOf(nickname: string, token: string) {
  const res = await server.inject({
    method: 'GET',
    url: `/api/users/${nickname}`,
    headers: { authorization: `Bearer ${token}` },
  });
  return JSON.parse(res.payload);
}

describe('Profile counters (Seguidores / Seguindo / Curtidas / Posts)', () => {
  it('returns real postsCount, followers and following for the viewed user', async () => {
    const a = await createAndLoginUser(server, { nickname: 'stats_a' });
    const b = await createAndLoginUser(server, { nickname: 'stats_b' });

    for (const text of ['post one', 'post two']) {
      const res = await server.inject({
        method: 'POST',
        url: '/api/posts',
        headers: { authorization: `Bearer ${a.accessToken}` },
        payload: { text },
      });
      expect(res.statusCode).toBe(201);
    }

    // b follows a → a has 1 follower, b has 0; b is following 1.
    expect((await followReq(b.accessToken, a.id)).statusCode).toBe(204);

    const body = await profileOf(a.nickname, b.accessToken);
    expect(body.user.postsCount).toBe(2);
    expect(body.user.followersCount).toBe(1);
    expect(body.user.followingCount).toBe(0);
    expect(body.user.likesCount).toBe(0);

    const reverse = await profileOf('stats_b', a.accessToken);
    expect(reverse.user.followersCount).toBe(0);
    expect(reverse.user.followingCount).toBe(1);
    expect(reverse.user.postsCount).toBe(0);
  });

  it('likesCount totals likes across ALL the user posts', async () => {
    const a = await createAndLoginUser(server, { nickname: 'likes_a' });
    const b = await createAndLoginUser(server, { nickname: 'likes_b' });
    const c = await createAndLoginUser(server, { nickname: 'likes_c' });

    const postIds: string[] = [];
    for (const text of ['one', 'two']) {
      const res = await server.inject({
        method: 'POST',
        url: '/api/posts',
        headers: { authorization: `Bearer ${a.accessToken}` },
        payload: { text },
      });
      postIds.push(JSON.parse(res.payload).id);
    }

    // b likes both posts, c likes one → 3 total likes on a's posts.
    for (const id of postIds) {
      await server.inject({
        method: 'POST',
        url: `/api/posts/${id}/like`,
        headers: { authorization: `Bearer ${b.accessToken}` },
      });
    }
    await server.inject({
      method: 'POST',
      url: `/api/posts/${postIds[0]}/like`,
      headers: { authorization: `Bearer ${c.accessToken}` },
    });

    const body = await profileOf('likes_a', a.accessToken);
    expect(body.user.likesCount).toBe(3);
  });

  it('posts count drops after deleting a post', async () => {
    const a = await createAndLoginUser(server, { nickname: 'delcount' });
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/posts',
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { text: 'count me' },
    });
    const post = JSON.parse(createRes.payload);

    await server.inject({
      method: 'DELETE',
      url: `/api/posts/${post.id}`,
      headers: { authorization: `Bearer ${a.accessToken}` },
    });

    const body = await profileOf('delcount', a.accessToken);
    expect(body.user.postsCount).toBe(0);
  });

  it('profile reports the viewer follow state', async () => {
    const a = await createAndLoginUser(server, { nickname: 'state_a' });
    const b = await createAndLoginUser(server, { nickname: 'state_b' });

    // Nothing yet → NONE.
    expect((await profileOf('state_a', b.accessToken)).follow).toBe('NONE');

    // b follows a → from b's view of a: FOLLOWING.
    await followReq(b.accessToken, a.id);
    expect((await profileOf('state_a', b.accessToken)).follow).toBe('FOLLOWING');

    // a follows b back → MUTUAL from both sides.
    await followReq(a.accessToken, b.id);
    expect((await profileOf('state_a', b.accessToken)).follow).toBe('MUTUAL');
    expect((await profileOf('state_b', a.accessToken)).follow).toBe('MUTUAL');
  });
});

describe('Followers / Following list endpoints', () => {
  it('lists followers and following with real pagination', async () => {
    const a = await createAndLoginUser(server, { nickname: 'fl_a' });
    const b = await createAndLoginUser(server, { nickname: 'fl_b' });
    const c = await createAndLoginUser(server, { nickname: 'fl_c' });

    // b and c both follow a.
    await followReq(b.accessToken, a.id);
    await followReq(c.accessToken, a.id);

    const followers = await server.inject({
      method: 'GET',
      url: `/api/users/${a.id}/followers?page=1&pageSize=1`,
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    const f1 = JSON.parse(followers.payload);
    expect(f1.total).toBe(2);
    expect(f1.users).toHaveLength(1);

    const page2 = await server.inject({
      method: 'GET',
      url: `/api/users/${a.id}/followers?page=2&pageSize=1`,
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    expect(JSON.parse(page2.payload).users).toHaveLength(1);

    // a follows nobody → following list is empty.
    const following = await server.inject({
      method: 'GET',
      url: `/api/users/${a.id}/following`,
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    expect(JSON.parse(following.payload).total).toBe(0);

    // b's following list contains a.
    const bFollowing = await server.inject({
      method: 'GET',
      url: `/api/users/${b.id}/following`,
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    expect(
      JSON.parse(bFollowing.payload).users.map((u: { nickname: string }) => u.nickname),
    ).toContain('fl_a');
  });
});
