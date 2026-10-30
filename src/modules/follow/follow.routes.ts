import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { toApiError } from '../../utils/errors.js';
import {
  followUser,
  getFollowState,
  listFollowers,
  listFollowing,
  unfollowUser,
} from './follow.service.js';

export const followRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Follow a user (instant, no approval). Idempotent.
  app.post('/users/:id/follow', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await followUser(request.user!.id, id);
      return reply.status(204).send();
    } catch (err) {
      throw toApiError(err);
    }
  });

  // Unfollow a user (instant). Idempotent — the "unfollow" of the button.
  app.delete('/users/:id/follow', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await unfollowUser(request.user!.id, id);
      return reply.status(204).send();
    } catch (err) {
      throw toApiError(err);
    }
  });

  // The viewer's relationship to another user (drives the profile buttons).
  app.get('/users/:id/follow-state', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const state = await getFollowState(request.user!.id, id);
      return reply.send({ state });
    } catch (err) {
      throw toApiError(err);
    }
  });

  // Who FOLLOWS this user ("Seguidores"). Same query backs the counter.
  app.get('/users/:id/followers', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { page?: string; pageSize?: string };
    const page = Number.parseInt(query.page ?? '1', 10) || 1;
    const pageSize = Number.parseInt(query.pageSize ?? '20', 10) || 20;
    return reply.send(await listFollowers(id, page, pageSize));
  });

  // Who this user FOLLOWS ("Seguindo").
  app.get('/users/:id/following', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { page?: string; pageSize?: string };
    const page = Number.parseInt(query.page ?? '1', 10) || 1;
    const pageSize = Number.parseInt(query.pageSize ?? '20', 10) || 20;
    return reply.send(await listFollowing(id, page, pageSize));
  });
};
