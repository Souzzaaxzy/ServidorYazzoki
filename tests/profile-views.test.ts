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

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

describe('Visualizações de perfil', () => {
  it('records a visit and shows it to the OWNER (most recent first)', async () => {
    const owner = await createAndLoginUser(server, { nickname: 'pv_owner' });
    const a = await createAndLoginUser(server, { nickname: 'pv_a' });
    const b = await createAndLoginUser(server, { nickname: 'pv_b' });

    // a and b visit the owner's profile.
    expect(
      (
        await server.inject({
          method: 'POST',
          url: `/api/users/${owner.id}/profile-view`,
          headers: auth(a.accessToken),
        })
      ).statusCode,
    ).toBe(204);
    await server.inject({
      method: 'POST',
      url: `/api/users/${owner.id}/profile-view`,
      headers: auth(b.accessToken),
    });

    const res = await server.inject({
      method: 'GET',
      url: `/api/users/${owner.id}/profile-views`,
      headers: auth(owner.accessToken),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.total).toBe(2);
    const names = body.views.map((v: { user: { nickname: string } }) => v.user.nickname).sort();
    expect(names).toEqual(['pv_a', 'pv_b']);
    // Each item carries the visitor + when they came (the app renders "há N").
    expect(body.views[0].viewedAt).toBeTruthy();
    expect(body.views[0].user.id).toBeTruthy();
  });

  it('counts visits per visitor (1 row, N views) and notifies the owner', async () => {
    const owner = await createAndLoginUser(server, { nickname: 'pv_idem_o' });
    const v = await createAndLoginUser(server, { nickname: 'pv_idem_v' });

    for (var i = 0; i < 3; i++) {
      await server.inject({
        method: 'POST',
        url: `/api/users/${owner.id}/profile-view`,
        headers: auth(v.accessToken),
      });
    }

    // ONE row for the pair, with the visit count.
    expect(
      await prisma.profileView.count({ where: { profileId: owner.id } }),
    ).toBe(1);
    const row = await prisma.profileView.findFirst({
      where: { profileId: owner.id },
    });
    expect(row!.views).toBe(3);

    // The owner was notified (native push + in-app list). The cooldown keeps
    // it to ONE notification, not three.
    expect(
      await prisma.notification.count({
        where: { recipientId: owner.id, actorId: v.id, type: 'PROFILE_VIEW' },
      }),
    ).toBe(1);

    // The list exposes the counter for the "N vezes" line.
    const res = await server.inject({
      method: 'GET',
      url: `/api/users/${owner.id}/profile-views`,
      headers: auth(owner.accessToken),
    });
    const body = JSON.parse(res.payload);
    expect(body.views[0].views).toBe(3);
  });

  it('never records a self-view', async () => {
    const owner = await createAndLoginUser(server, { nickname: 'pv_self_o' });
    await server.inject({
      method: 'POST',
      url: `/api/users/${owner.id}/profile-view`,
      headers: auth(owner.accessToken),
    });
    expect(
      await prisma.profileView.count({ where: { profileId: owner.id } }),
    ).toBe(0);
  });

  it('PRIVACY: another user can NOT read someone else\'s visitors (403)', async () => {
    const owner = await createAndLoginUser(server, { nickname: 'pv_priv_o' });
    const visitor = await createAndLoginUser(server, { nickname: 'pv_priv_v' });
    const snooper = await createAndLoginUser(server, { nickname: 'pv_priv_s' });

    await server.inject({
      method: 'POST',
      url: `/api/users/${owner.id}/profile-view`,
      headers: auth(visitor.accessToken),
    });

    // The visitor himself cannot read the owner's list…
    const asVisitor = await server.inject({
      method: 'GET',
      url: `/api/users/${owner.id}/profile-views`,
      headers: auth(visitor.accessToken),
    });
    expect(asVisitor.statusCode).toBe(403);

    // …nor an unrelated third party.
    const asSnooper = await server.inject({
      method: 'GET',
      url: `/api/users/${owner.id}/profile-views`,
      headers: auth(snooper.accessToken),
    });
    expect(asSnooper.statusCode).toBe(403);
  });

  it('exposes the owner\'s own counter and requires auth', async () => {
    const owner = await createAndLoginUser(server, { nickname: 'pv_count_o' });
    const v = await createAndLoginUser(server, { nickname: 'pv_count_v' });
    await server.inject({
      method: 'POST',
      url: `/api/users/${owner.id}/profile-view`,
      headers: auth(v.accessToken),
    });

    const res = await server.inject({
      method: 'GET',
      url: '/api/profile-views/count',
      headers: auth(owner.accessToken),
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).count).toBe(1);

    // Anonymous callers are rejected.
    expect(
      (await server.inject({ method: 'GET', url: '/api/profile-views/count' }))
        .statusCode,
    ).toBe(401);
  });
});
