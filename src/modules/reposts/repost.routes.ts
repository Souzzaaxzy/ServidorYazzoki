import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { toApiError } from '../../utils/errors.js';
import { listReposters, listReposts, toggleRepost } from './repost.service.js';

export const repostRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // POST /posts/:id/repost — TOGGLE: reposts when not reposted, removes when
  // already reposted. Rate-limited per (user, post) server-side.
  app.post('/posts/:id/repost', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const result = await toggleRepost(request.user!.id, id);
      return reply.send(result);
    } catch (err) {
      throw toApiError(err);
    }
  });

  // GET /posts/:id/reposters — EVERY user who reposted this post (paginated).
  // The post payload embeds only the 3 newest (badge); this backs "see all".
  app.get('/posts/:id/reposters', { onRequest: [app.optionalAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { page?: string; pageSize?: string };
    const page = Number.parseInt(query.page ?? '1', 10) || 1;
    const pageSize = Number.parseInt(query.pageSize ?? '20', 10) || 20;
    const result = await listReposters(id, page, pageSize);
    return reply.send(result);
  });

  // GET /users/:id/reposts — the user's reposts, newest first (profile tab).
  app.get('/users/:id/reposts', { onRequest: [app.optionalAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { page?: string; pageSize?: string };
    const page = Number.parseInt(query.page ?? '1', 10) || 1;
    const pageSize = Number.parseInt(query.pageSize ?? '20', 10) || 20;
    const result = await listReposts(id, request.user?.id, page, pageSize);
    return reply.send(result);
  });
};
