import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { toApiError } from '../../utils/errors.js';
import {
  listProfileViews,
  profileViewsCount,
  recordProfileView,
} from './profileview.service.js';

export const profileViewRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // POST /users/:id/profile-view — records a visit. Idempotent (refreshes the
  // timestamp); a self-view is ignored server-side.
  app.post('/users/:id/profile-view', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await recordProfileView(request.user!.id, id);
      return reply.status(204).send();
    } catch (err) {
      throw toApiError(err);
    }
  });

  // GET /users/:id/profile-views — the visitors of THAT profile. Only the
  // OWNER may read it (403 otherwise): nobody sees who visited someone else.
  app.get('/users/:id/profile-views', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { page?: string; pageSize?: string };
    const page = Number.parseInt(query.page ?? '1', 10) || 1;
    const pageSize = Number.parseInt(query.pageSize ?? '20', 10) || 20;
    try {
      const result = await listProfileViews(id, request.user!.id, page, pageSize);
      return reply.send(result);
    } catch (err) {
      throw toApiError(err);
    }
  });

  // GET /profile-views/count — the session user's own visitor counter.
  app.get('/profile-views/count', { onRequest: [app.authenticate] }, async (request, reply) => {
    const count = await profileViewsCount(request.user!.id);
    return reply.send({ count });
  });
};
