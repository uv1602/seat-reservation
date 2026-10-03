import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuid } from 'uuid';
import logger from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      userId?: string;
      startTime: number;
    }
  }
}

export async function registerRequestContextMiddleware(
  app: FastifyInstance
): Promise<void> {
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Generate or retrieve correlation ID
    const correlationId =
      (request.headers['x-correlation-id'] as string) || uuid();

    // Extract user ID from authorization header
    let userId: string | undefined;
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      userId = authHeader.slice(7);
    } else {
      userId = request.headers['x-user-id'] as string | undefined;
    }

    // Attach to request
    (request as any).correlationId = correlationId;
    (request as any).userId = userId;
    (request as any).startTime = Date.now();

    // Set correlation ID in response headers
    reply.header('X-Correlation-ID', correlationId);

    logger.debug(
      {
        correlationId,
        method: request.method,
        path: request.url,
        userId,
      },
      'Incoming request'
    );
  });

  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const duration = Date.now() - ((request as any).startTime || 0);
    const correlationId = (request as any).correlationId || 'unknown';

    logger.debug(
      {
        correlationId,
        method: request.method,
        path: request.url,
        statusCode: reply.statusCode,
        duration: `${duration}ms`,
      },
      'Request completed'
    );
  });
}

declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string;
    userId?: string;
  }
}
