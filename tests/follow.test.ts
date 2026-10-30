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

function follow(token: string, id: string) {
  return server.inject({
    method: 'POST',
    url: `/api/users/${id}/follow`,
    headers: { authorization: `Bearer ${token}` },
  });
}
function unfollow(token: string, id: string) {
  return server.inject({
    method: 'DELETE',
    url: `/api/users/${id}/follow`,
    headers: { authorization: `Bearer ${token}` },
  });
}
function followState(token: string, id: string) {
  return server.inject({
    method: 'GET',
    url: `/api/users/${id}/follow-state`,
    headers: { authorization: `Bearer ${token}` },
  });
}

describe('Follow / unfollow', () => {
  it('follows instantly (204) and notifies the followed user', async () => {
    const a = await createAndLoginUser(server, { nickname: 'fa' });
    const b = await createAndLoginUser(server, { nickname: 'fb' });

    expect((await follow(a.accessToken, b.id)).statusCode).toBe(204);

    const note = await prisma.notification.findFirst({
      where: { recipientId: b.id, actorId: a.id, type: 'FOLLOW' },
    });
    expect(note).not.toBeNull();
  });

  it('rejects following yourself with 400', async () => {
    const a = await createAndLoginUser(server, { nickname: 'fself' });
    expect((await follow(a.accessToken, a.id)).statusCode).toBe(400);
  });

  it('is idempotent: following twice keeps a single row', async () => {
    const a = await createAndLoginUser(server, { nickname: 'fdup_a' });
    const b = await createAndLoginUser(server, { nickname: 'fdup_b' });

    expect((await follow(a.accessToken, b.id)).statusCode).toBe(204);
    expect((await follow(a.accessToken, b.id)).statusCode).toBe(204);

    const count = await prisma.follow.count({
      where: { followerId: a.id, followingId: b.id },
    });
    expect(count).toBe(1);
  });

  it('unfollow is instant and idempotent (204 even when not following)', async () => {
    const a = await createAndLoginUser(server, { nickname: 'fun_a' });
    const b = await createAndLoginUser(server, { nickname: 'fun_b' });

    await follow(a.accessToken, b.id);
    expect((await unfollow(a.accessToken, b.id)).statusCode).toBe(204);
    expect((await unfollow(a.accessToken, b.id)).statusCode).toBe(204);

    const count = await prisma.follow.count({
      where: { followerId: a.id, followingId: b.id },
    });
    expect(count).toBe(0);
  });

  it('unfollow removes the pending FOLLOW notification', async () => {
    const a = await createAndLoginUser(server, { nickname: 'fnot_a' });
    const b = await createAndLoginUser(server, { nickname: 'fnot_b' });

    await follow(a.accessToken, b.id);
    await unfollow(a.accessToken, b.id);

    const note = await prisma.notification.count({
      where: { recipientId: b.id, actorId: a.id, type: 'FOLLOW' },
    });
    expect(note).toBe(0);
  });
});

describe('Follow state (profile buttons)', () => {
  it('walks NONE → FOLLOWING → MUTUAL and back', async () => {
    const a = await createAndLoginUser(server, { nickname: 'fs_a' });
    const b = await createAndLoginUser(server, { nickname: 'fs_b' });

    expect(JSON.parse((await followState(a.accessToken, b.id)).payload).state).toBe('NONE');

    await follow(a.accessToken, b.id);
    expect(JSON.parse((await followState(a.accessToken, b.id)).payload).state).toBe('FOLLOWING');
    // From b's side, a follows them → FOLLOWS_YOU.
    expect(JSON.parse((await followState(b.accessToken, a.id)).payload).state).toBe('FOLLOWS_YOU');

    await follow(b.accessToken, a.id); // follow back
    expect(JSON.parse((await followState(a.accessToken, b.id)).payload).state).toBe('MUTUAL');
    expect(JSON.parse((await followState(b.accessToken, a.id)).payload).state).toBe('MUTUAL');

    // a unfollows b → from a's view b still follows them (FOLLOWS_YOU),
    // which is exactly the "Seguir de volta" state.
    await unfollow(a.accessToken, b.id);
    expect(JSON.parse((await followState(a.accessToken, b.id)).payload).state).toBe('FOLLOWS_YOU');
    expect(JSON.parse((await followState(b.accessToken, a.id)).payload).state).toBe('FOLLOWING');
  });

  it('requires authentication (401)', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/users/x/follow-state' });
    expect(res.statusCode).toBe(401);
  });
});

describe('Follow gates private interaction (DM / groups)', () => {
  it('a one-directional follow is enough to open a conversation', async () => {
    const a = await createAndLoginUser(server, { nickname: 'gate_a' });
    const b = await createAndLoginUser(server, { nickname: 'gate_b' });

    // No follow → forbidden.
    const denied = await server.inject({
      method: 'POST',
      url: `/api/conversations/${b.id}`,
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    expect(denied.statusCode).toBe(403);

    // a follows b → a may DM b.
    await follow(a.accessToken, b.id);
    const ok = await server.inject({
      method: 'POST',
      url: `/api/conversations/${b.id}`,
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    // get-or-create returns 200 for the created/existing conversation.
    expect(ok.statusCode).toBe(200);
  });
});
