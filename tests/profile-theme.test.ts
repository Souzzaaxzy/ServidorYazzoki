import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestServer, closeTestServer, createAndLoginUser } from './helpers.js';
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

describe('Tema publicado no perfil', () => {
  it('começa sem tema e aceita um id do catálogo', async () => {
    const a = await createAndLoginUser(server, { nickname: 'th_a' });

    // Sem tema publicado.
    let me = await server.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: auth(a.accessToken),
    });
    expect(JSON.parse(me.payload).user.profileThemeId ?? null).toBeNull();

    // Publica um tema válido.
    const res = await server.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers: auth(a.accessToken),
      payload: { profileThemeId: 'sakura' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).user.profileThemeId).toBe('sakura');
  });

  it('o tema do dono viaja no perfil (para OUTROS usuários verem)', async () => {
    const owner = await createAndLoginUser(server, { nickname: 'th_owner' });
    const viewer = await createAndLoginUser(server, { nickname: 'th_viewer' });

    await server.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers: auth(owner.accessToken),
      payload: { profileThemeId: 'matcha' },
    });

    // O visitante lê o perfil e recebe o tema publicado.
    const profile = await server.inject({
      method: 'GET',
      url: `/api/users/${owner.nickname}`,
      headers: auth(viewer.accessToken),
    });
    expect(JSON.parse(profile.payload).user.profileThemeId).toBe('matcha');
  });

  it('WHITELIST: rejeita um tema fora do catálogo (400)', async () => {
    const a = await createAndLoginUser(server, { nickname: 'th_bad' });
    const res = await server.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers: auth(a.accessToken),
      payload: { profileThemeId: 'tema-inventado' },
    });
    expect(res.statusCode).toBe(400);
  });

  it("'' limpa o tema publicado", async () => {
    const a = await createAndLoginUser(server, { nickname: 'th_clear' });
    await server.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers: auth(a.accessToken),
      payload: { profileThemeId: 'fuji' },
    });
    const res = await server.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers: auth(a.accessToken),
      payload: { profileThemeId: '' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).user.profileThemeId).toBeNull();
  });

  it('omitir o campo NÃO apaga o tema já publicado', async () => {
    const a = await createAndLoginUser(server, { nickname: 'th_keep' });
    await server.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers: auth(a.accessToken),
      payload: { profileThemeId: 'tsuki' },
    });
    // Atualiza só a bio.
    const res = await server.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers: auth(a.accessToken),
      payload: { bio: 'nova bio' },
    });
    expect(JSON.parse(res.payload).user.profileThemeId).toBe('tsuki');
  });
});
