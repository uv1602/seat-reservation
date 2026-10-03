import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getMetrics } from '../utils/metrics';

export async function registerMetricsMiddleware(
  app: FastifyInstance
): Promise<void> {
  const metrics = getMetrics();

  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    metrics.concurrentRequests.inc({ endpoint: request.url });
  });

  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const duration =
      (Date.now() - ((request as any).startTime || 0)) / 1000;
    const endpoint = request.url.split('?')[0]; // Remove query params

    metrics.requestDuration.observe(
      { method: request.method, endpoint },
      duration
    );
    metrics.concurrentRequests.dec({ endpoint });

    if (reply.statusCode >= 500) {
      metrics.errors.inc({ type: 'server_error', endpoint });
    } else if (reply.statusCode >= 400) {
      metrics.errors.inc({ type: 'client_error', endpoint });
    }
  });
}
