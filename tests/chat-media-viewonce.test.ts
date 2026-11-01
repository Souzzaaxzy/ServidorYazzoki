import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  buildTestServer,
  closeTestServer,
  createAndLoginUser,
  followEachOther,
} from './helpers.js';
import type { FastifyInstance } from 'fastify';

let server: FastifyInstance;

beforeAll(async () => {
  server = await buildTestServer();
});
afterAll(async () => {
  await closeTestServer();
});

async function pair(a: any, b: any) {
  await followEachOther(server, a, b);
  const res = await server.inject({
    method: 'POST',
    url: `/api/conversations/${b.id}`,
    headers: { authorization: `Bearer ${a.accessToken}` },
  });
  return JSON.parse(res.payload).conversation as { id: string };
}

const MEDIA = { kind: 'image', url: '/static/uploads/foto.png' };

describe('Media: legenda, álbum e visualização única', () => {
  it('legenda acompanha a mídia e NÃO vira o rótulo da lista', async () => {
    const a = await createAndLoginUser(server, { nickname: 'a_legenda' });
    const b = await createAndLoginUser(server, { nickname: 'b_legenda' });
    const conv = await pair(a, b);

    const res = await server.inject({
      method: 'POST',
      url: `/api/conversations/${conv.id}/media`,
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { ...MEDIA, caption: '  olha essa foto  ' },
    });
    expect(res.statusCode).toBe(201);
    const msg = JSON.parse(res.payload).message;
    // A legenda é trimada e vem no campo próprio...
    expect(msg.caption).toBe('olha essa foto');
    // ...enquanto `content` continua sendo o rótulo curto da lista.
    expect(msg.content).toBe('📷 Foto');
  });

  it('álbum agrupa as mídias e o servidor recusa passar de 10', async () => {
    const a = await createAndLoginUser(server, { nickname: 'a_album' });
    const b = await createAndLoginUser(server, { nickname: 'b_album' });
    const conv = await pair(a, b);

    const items = Array.from({ length: 3 }, (_, i) => ({
      kind: 'image' as const,
      url: `/static/uploads/f${i}.png`,
    }));
    const res = await server.inject({
      method: 'POST',
      url: `/api/conversations/${conv.id}/media`,
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { ...MEDIA, items },
    });
    expect(res.statusCode).toBe(201);
    const msg = JSON.parse(res.payload).message;
    expect(msg.type).toBe('album');
    expect(msg.album).toHaveLength(3);
    expect(msg.content).toBe('🖼️ Álbum (3)');

    // 11 itens: o limite é do SERVIDOR, não só da tela.
    const tooMany = Array.from({ length: 11 }, (_, i) => ({
      kind: 'image' as const,
      url: `/static/uploads/x${i}.png`,
    }));
    const bad = await server.inject({
      method: 'POST',
      url: `/api/conversations/${conv.id}/media`,
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { ...MEDIA, items: tooMany },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('visualização única: o destinatário vê UMA vez e depois a mídia some', async () => {
    const a = await createAndLoginUser(server, { nickname: 'a_vo' });
    const b = await createAndLoginUser(server, { nickname: 'b_vo' });
    const conv = await pair(a, b);

    const send = await server.inject({
      method: 'POST',
      url: `/api/conversations/${conv.id}/media`,
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { ...MEDIA, viewOnce: true },
    });
    expect(send.statusCode).toBe(201);
    const msg = JSON.parse(send.payload).message;
    expect(msg.viewOnce).toBe(true);

    // O REMETENTE sempre enxerga a própria mídia.
    expect(msg.imageUrl).toBe(MEDIA.url);

    // Antes de abrir, o destinatário também enxerga.
    const before = await server.inject({
      method: 'GET',
      url: `/api/conversations/${conv.id}/messages`,
      headers: { authorization: `Bearer ${b.accessToken}` },
    });
    const seen = JSON.parse(before.payload).messages.find((m: any) => m.id === msg.id);
    expect(seen.imageUrl).toBe(MEDIA.url);
    expect(seen.mediaWithheld).toBe(false);

    // Ele ABRE.
    const opened = await server.inject({
      method: 'POST',
      url: `/api/messages/${msg.id}/viewed`,
      headers: { authorization: `Bearer ${b.accessToken}` },
    });
    expect(opened.statusCode).toBe(200);

    // Agora a mídia é RETIRADA dele — a URL não é mais servida.
    const after = await server.inject({
      method: 'GET',
      url: `/api/conversations/${conv.id}/messages`,
      headers: { authorization: `Bearer ${b.accessToken}` },
    });
    const consumed = JSON.parse(after.payload).messages.find((m: any) => m.id === msg.id);
    expect(consumed.mediaWithheld).toBe(true);
    expect(consumed.imageUrl).toBeNull();

    // E o REMETENTE continua com a cópia dele.
    const senderView = await server.inject({
      method: 'GET',
      url: `/api/conversations/${conv.id}/messages`,
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    const own = JSON.parse(senderView.payload).messages.find((m: any) => m.id === msg.id);
    expect(own.imageUrl).toBe(MEDIA.url);
  });

  it('o remetente não pode "abrir" a própria mídia (queimaria a do outro)', async () => {
    const a = await createAndLoginUser(server, { nickname: 'a_vo2' });
    const b = await createAndLoginUser(server, { nickname: 'b_vo2' });
    const conv = await pair(a, b);

    const send = await server.inject({
      method: 'POST',
      url: `/api/conversations/${conv.id}/media`,
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { ...MEDIA, viewOnce: true },
    });
    const msg = JSON.parse(send.payload).message;

    const res = await server.inject({
      method: 'POST',
      url: `/api/messages/${msg.id}/viewed`,
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    expect(res.statusCode).toBe(400);

    // E a mídia do destinatário segue intacta.
    const view = await server.inject({
      method: 'GET',
      url: `/api/conversations/${conv.id}/messages`,
      headers: { authorization: `Bearer ${b.accessToken}` },
    });
    const m = JSON.parse(view.payload).messages.find((x: any) => x.id === msg.id);
    expect(m.imageUrl).toBe(MEDIA.url);
  });

  it('álbum NÃO pode ser de visualização única (as regras se contradizem)', async () => {
    const a = await createAndLoginUser(server, { nickname: 'a_vo3' });
    const b = await createAndLoginUser(server, { nickname: 'b_vo3' });
    const conv = await pair(a, b);

    const res = await server.inject({
      method: 'POST',
      url: `/api/conversations/${conv.id}/media`,
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: {
        ...MEDIA,
        viewOnce: true,
        items: [
          { kind: 'image', url: '/static/uploads/1.png' },
          { kind: 'image', url: '/static/uploads/2.png' },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
  });
});
