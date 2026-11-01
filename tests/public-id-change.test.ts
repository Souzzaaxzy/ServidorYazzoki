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

describe('Mudar o ID (#id) no perfil', () => {
  it('lets the user adopt a free number and returns the formatted label', async () => {
    const user = await createAndLoginUser(server, { nickname: 'id_change' });
    const res = await server.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers: auth(user.accessToken),
      payload: { publicId: '424242' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.user.publicId).toBe(424242);
    expect(body.user.publicIdLabel).toBe('#00424242');
  });

  it('rejects a number already taken by another account (409)', async () => {
    const a = await createAndLoginUser(server, { nickname: 'id_taken_a' });
    const b = await createAndLoginUser(server, { nickname: 'id_taken_b' });
    const aRow = await prisma.user.findUnique({ where: { id: a.id } });

    const res = await server.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers: auth(b.accessToken),
      payload: { publicId: String(aRow!.publicId) },
    });
    expect(res.statusCode).toBe(409);
  });

  it('rejects non-numeric ids (400)', async () => {
    const user = await createAndLoginUser(server, { nickname: 'id_bad' });
    const res = await server.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers: auth(user.accessToken),
      payload: { publicId: 'abc' },
    });
    expect(res.statusCode).toBe(400);
  });
});
