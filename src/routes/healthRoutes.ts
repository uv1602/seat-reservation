import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppDataSource } from '../database/data-source';
import logger from '../utils/logger';

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /health/live
   * Liveness probe
   */
  app.get('/health/live', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.send({
      success: true,
      data: { status: 'alive' },
      meta: {
        correlationId: request.correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  });

  /**
   * GET /health/ready
   * Readiness probe
   */
  app.get('/health/ready', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!AppDataSource.isInitialized) {
        reply.status(503).send({
          success: false,
          error: {
            code: 'NOT_READY',
            message: 'Database not connected',
          },
          meta: {
            correlationId: request.correlationId,
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      // Test database connection
      await AppDataSource.query('SELECT NOW()');

      reply.send({
        success: true,
        data: { status: 'ready' },
        meta: {
          correlationId: request.correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error(
        {
          correlationId: request.correlationId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Health check failed'
      );

      reply.status(503).send({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Database connection failed',
        },
        meta: {
          correlationId: request.correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }
  });

  /**
   * GET /metrics
   * Prometheus metrics endpoint
   */
  app.get('/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { getMetrics } = await import('../utils/metrics');
      const metrics = getMetrics();
      reply.type('text/plain');
      reply.send(await metrics.register.metrics());
    } catch (error) {
      logger.error(
        {
          correlationId: request.correlationId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to generate metrics'
      );

      reply.status(500).send({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate metrics',
        },
      });
    }
  });
}
