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

async function createPost(token: string, text: string) {
  const res = await server.inject({
    method: 'POST',
    url: '/api/posts',
    headers: auth(token),
    payload: { text },
  });
  return JSON.parse(res.payload);
}

function repost(token: string, postId: string) {
  return server.inject({
    method: 'POST',
    url: `/api/posts/${postId}/repost`,
    headers: auth(token),
  });
}

describe('Repost de post (toggle)', () => {
  it('reposts, marks the payload and notifies the author', async () => {
    const author = await createAndLoginUser(server, { nickname: 'rp_author' });
    const other = await createAndLoginUser(server, { nickname: 'rp_other' });
    const post = await createPost(author.accessToken, 'olá repost');

    const res = await repost(other.accessToken, post.id);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.reposted).toBe(true);
    expect(body.repostCount).toBe(1);

    // The author is notified.
    const note = await prisma.notification.findFirst({
      where: { recipientId: author.id, actorId: other.id, type: 'REPOST' },
    });
    expect(note).not.toBeNull();

    // The feed marks the post as reposted FOR the reposter.
    const feed = await server.inject({
      method: 'GET',
      url: '/api/posts',
      headers: auth(other.accessToken),
    });
    const mine = JSON.parse(feed.payload).posts.find((p: { id: string }) => p.id === post.id);
    expect(mine.reposted).toBe(true);
    expect(mine.repostCount).toBe(1);

    // …and NOT for another viewer.
    const feedAuthor = await server.inject({
      method: 'GET',
      url: '/api/posts',
      headers: auth(author.accessToken),
    });
    const theirs = JSON.parse(feedAuthor.payload).posts.find(
      (p: { id: string }) => p.id === post.id,
    );
    expect(theirs.reposted).toBe(false);
  });

  it('never notifies when reposting your own post', async () => {
    const author = await createAndLoginUser(server, { nickname: 'rp_self' });
    const post = await createPost(author.accessToken, 'meu post');
    const res = await repost(author.accessToken, post.id);
    expect(JSON.parse(res.payload).reposted).toBe(true);
    const note = await prisma.notification.count({
      where: { actorId: author.id, type: 'REPOST' },
    });
    expect(note).toBe(0);
  });

  it('toggling OFF removes the repost and its notification', async () => {
    const author = await createAndLoginUser(server, { nickname: 'rp_off_a' });
    const other = await createAndLoginUser(server, { nickname: 'rp_off_b' });
    const post = await createPost(author.accessToken, 'toggle');

    await repost(other.accessToken, post.id);
    // Bypass the cooldown by clearing the notification timestamp so the
    // second toggle is allowed (the row itself is gone after the undo).
    await prisma.notification.deleteMany({
      where: { actorId: other.id, type: 'REPOST' },
    });

    const off = await repost(other.accessToken, post.id);
    expect(JSON.parse(off.payload).reposted).toBe(false);
    expect(JSON.parse(off.payload).repostCount).toBe(0);

    expect(
      await prisma.repost.count({ where: { userId: other.id, postId: post.id } }),
    ).toBe(0);
    expect(
      await prisma.notification.count({
        where: { recipientId: author.id, actorId: other.id, type: 'REPOST' },
      }),
    ).toBe(0);
  });

  it('rate-limits rapid RE-reposting but never blocks the undo (429)', async () => {
    const author = await createAndLoginUser(server, { nickname: 'rp_rl_a' });
    const other = await createAndLoginUser(server, { nickname: 'rp_rl_b' });
    const post = await createPost(author.accessToken, 'spam');

    // 1) repost → 2) undo (ALWAYS allowed, must not be throttled)
    expect((await repost(other.accessToken, post.id)).statusCode).toBe(200);
    const undo = await repost(other.accessToken, post.id);
    expect(undo.statusCode).toBe(200);
    expect(JSON.parse(undo.payload).reposted).toBe(false);

    // 3) repost again immediately → throttled server-side.
    const again = await repost(other.accessToken, post.id);
    expect(again.statusCode).toBe(429);
  });

  it('exposes WHO reposted (reposters) on the post payload', async () => {
    const author = await createAndLoginUser(server, { nickname: 'rp_who_a' });
    const r1 = await createAndLoginUser(server, { nickname: 'rp_who_b' });
    const post = await createPost(author.accessToken, 'quem repostou');

    await repost(r1.accessToken, post.id);

    const detail = await server.inject({
      method: 'GET',
      url: `/api/posts/${post.id}`,
      headers: auth(author.accessToken),
    });
    const body = JSON.parse(detail.payload);
    expect(body.repostCount).toBe(1);
    expect(body.reposters).toHaveLength(1);
    expect(body.reposters[0].nickname).toBe('rp_who_b');
    expect(body.reposters[0].id).toBe(r1.id);
  });

  it('profile payload carries repostsCount and repostedBy attribution', async () => {
    const author = await createAndLoginUser(server, { nickname: 'rp_attr_a' });
    const reposter = await createAndLoginUser(server, { nickname: 'rp_attr_b' });
    const post = await createPost(author.accessToken, 'atribuicao');
    await repost(reposter.accessToken, post.id);

    // The profile counter reflects the repost.
    const profile = await server.inject({
      method: 'GET',
      url: `/api/users/${reposter.nickname}`,
      headers: auth(author.accessToken),
    });
    expect(JSON.parse(profile.payload).user.repostsCount).toBe(1);

    // The repost list attributes the item to the reposter (clickable name).
    const list = await server.inject({
      method: 'GET',
      url: `/api/users/${reposter.id}/reposts`,
      headers: auth(author.accessToken),
    });
    const item = JSON.parse(list.payload).posts[0];
    expect(item.repostedBy.nickname).toBe('rp_attr_b');
    expect(item.repostedBy.id).toBe(reposter.id);
    // …and the ORIGINAL author is still the post author.
    expect(item.author.nickname).toBe('rp_attr_a');
  });

  it('lists ALL reposters of a post (paginated) at /posts/:id/reposters', async () => {
    const author = await createAndLoginUser(server, { nickname: 'rp_all_a' });
    const r1 = await createAndLoginUser(server, { nickname: 'rp_all_b' });
    const r2 = await createAndLoginUser(server, { nickname: 'rp_all_c' });
    const post = await createPost(author.accessToken, 'todos os reposts');
    await repost(r1.accessToken, post.id);
    await repost(r2.accessToken, post.id);

    const res = await server.inject({
      method: 'GET',
      url: `/api/posts/${post.id}/reposters`,
      headers: auth(author.accessToken),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.total).toBe(2);
    expect(body.users).toHaveLength(2);
    const names = body.users.map((u: { nickname: string }) => u.nickname).sort();
    expect(names).toEqual(['rp_all_b', 'rp_all_c']);
    // Each entry carries the data the sheet needs to open the profile.
    expect(body.users[0].id).toBeTruthy();
    expect(body.users[0]).toHaveProperty('repostedAt');
  });

  it('reposters endpoint is paginated and returns an empty list when nobody reposted', async () => {
    const author = await createAndLoginUser(server, { nickname: 'rp_none_a' });
    const post = await createPost(author.accessToken, 'sem reposts');

    const res = await server.inject({
      method: 'GET',
      url: `/api/posts/${post.id}/reposters?page=1&pageSize=1`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.total).toBe(0);
    expect(body.users).toHaveLength(0);
  });

  it('404 for an unknown post', async () => {
    const user = await createAndLoginUser(server, { nickname: 'rp_404' });
    expect((await repost(user.accessToken, 'does-not-exist')).statusCode).toBe(404);
  });
});

describe('Perfil: lista de reposts', () => {
  it('returns the reposted post and its total', async () => {
    const author = await createAndLoginUser(server, { nickname: 'rpl_a' });
    const reposter = await createAndLoginUser(server, { nickname: 'rpl_b' });
    const post = await createPost(author.accessToken, 'vai pro perfil');
    await repost(reposter.accessToken, post.id);

    const res = await server.inject({
      method: 'GET',
      url: `/api/users/${reposter.id}/reposts`,
      headers: auth(author.accessToken),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.total).toBe(1);
    expect(body.posts).toHaveLength(1);
    expect(body.posts[0].id).toBe(post.id);
    // `reposted` is relative to the VIEWER (here the original author, who did
    // NOT repost it) — the reposter's own view sets it true.
    expect(body.posts[0].reposted).toBe(false);
    // The ORIGINAL author is preserved (the repost references the post).
    expect(body.posts[0].author.nickname).toBe('rpl_a');
    // …and the attribution points at the reposter.
    expect(body.posts[0].repostedBy.nickname).toBe('rpl_b');
  });

  it('the author of the original sees the repost count on their post', async () => {
    const author = await createAndLoginUser(server, { nickname: 'rpc_a' });
    const r1 = await createAndLoginUser(server, { nickname: 'rpc_b' });
    const r2 = await createAndLoginUser(server, { nickname: 'rpc_c' });
    const post = await createPost(author.accessToken, 'contador');
    await repost(r1.accessToken, post.id);
    await repost(r2.accessToken, post.id);

    const detail = await server.inject({
      method: 'GET',
      url: `/api/posts/${post.id}`,
      headers: auth(author.accessToken),
    });
    expect(JSON.parse(detail.payload).repostCount).toBe(2);
  });
});

describe('Repost de story', () => {
  it('copies the story into the reposter strip and notifies the author', async () => {
    const author = await createAndLoginUser(server, { nickname: 'sr_a' });
    const other = await createAndLoginUser(server, { nickname: 'sr_b' });

    const created = await server.inject({
      method: 'POST',
      url: '/api/stories',
      headers: auth(author.accessToken),
      payload: { type: 'text', text: 'story original' },
    });
    const story = JSON.parse(created.payload);

    const res = await server.inject({
      method: 'POST',
      url: `/api/stories/${story.id}/repost`,
      headers: auth(other.accessToken),
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).reposted).toBe(true);

    // The author got a STORY_REPOST notification.
    expect(
      await prisma.notification.count({
        where: { recipientId: author.id, actorId: other.id, type: 'STORY_REPOST' },
      }),
    ).toBe(1);

    // The reposter's OWN story list now carries a copy marked "repostedFrom".
    const mine = await server.inject({
      method: 'GET',
      url: '/api/stories',
      headers: auth(other.accessToken),
    });
    const groups = JSON.parse(mine.payload).groups;
    const own = groups.find((g: { author: { id: string } }) => g.author.id === other.id);
    expect(own).toBeTruthy();
    const copy = own.stories[0];
    expect(copy.repostedFrom).toBe('sr_a');
    // The copy is NOT the original id.
    expect(copy.id).not.toBe(story.id);
  });

  it('refuses reposting your own story', async () => {
    const author = await createAndLoginUser(server, { nickname: 'sr_self' });
    const created = await server.inject({
      method: 'POST',
      url: '/api/stories',
      headers: auth(author.accessToken),
      payload: { type: 'text', text: 'meu story' },
    });
    const story = JSON.parse(created.payload);
    const res = await server.inject({
      method: 'POST',
      url: `/api/stories/${story.id}/repost`,
      headers: auth(author.accessToken),
    });
    expect(res.statusCode).toBe(400);
  });

  it('toggling OFF removes the copy story', async () => {
    const author = await createAndLoginUser(server, { nickname: 'sr_off_a' });
    const other = await createAndLoginUser(server, { nickname: 'sr_off_b' });
    const created = await server.inject({
      method: 'POST',
      url: '/api/stories',
      headers: auth(author.accessToken),
      payload: { type: 'text', text: 'toggle story' },
    });
    const story = JSON.parse(created.payload);

    await server.inject({
      method: 'POST',
      url: `/api/stories/${story.id}/repost`,
      headers: auth(other.accessToken),
    });
    const off = await server.inject({
      method: 'POST',
      url: `/api/stories/${story.id}/repost`,
      headers: auth(other.accessToken),
    });
    expect(JSON.parse(off.payload).reposted).toBe(false);
    expect(
      await prisma.storyRepost.count({ where: { userId: other.id } }),
    ).toBe(0);
  });
});
