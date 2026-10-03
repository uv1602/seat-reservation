import 'reflect-metadata';
import Fastify, { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { initializeDatabase, closeDatabase } from './database/data-source';
import { registerErrorHandler } from './middleware/errorHandler';
import { registerRequestContextMiddleware } from './middleware/requestContext';
import { registerMetricsMiddleware } from './middleware/metricsMiddleware';
import { registerHealthRoutes } from './routes/healthRoutes';
import { registerShowRoutes } from './routes/showRoutes';
import { registerReservationRoutes } from './routes/reservationRoutes';
import { registerSwaggerSchemas } from './routes/swaggerRoutes';
import { swaggerOptions, swaggerUiOptions } from './config/swagger';
import logger from './utils/logger';

let app: FastifyInstance;

async function createServer(): Promise<FastifyInstance> {
  app = Fastify({
    logger: false, // We use pino directly
  });

  // Register Swagger
  await app.register(fastifySwagger, {
    openapi: swaggerOptions,
    mode: 'dynamic',
  });
  await app.register(fastifySwaggerUi, swaggerUiOptions);

  // Register middleware
  await registerRequestContextMiddleware(app);
  await registerMetricsMiddleware(app);
  await registerErrorHandler(app);

  // Register Swagger schemas
  await registerSwaggerSchemas(app);

  // Register routes
  await registerHealthRoutes(app);
  await registerShowRoutes(app);
  await registerReservationRoutes(app);

  // 404 handler
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
      },
      meta: {
        correlationId: (request as any).correlationId || 'unknown',
        timestamp: new Date().toISOString(),
      },
    });
  });

  return app;
}

async function startServer(): Promise<void> {
  try {
    logger.info('Initializing database...');
    await initializeDatabase();

    logger.info('Creating Fastify server...');
    app = await createServer();

    const port = parseInt(process.env.PORT || '8080', 10);
    const host = '0.0.0.0';

    await app.listen({ port, host });

    logger.info({ port, host }, 'Server started successfully');
    logger.info(`📚 Swagger UI available at http://localhost:${port}/api/docs`);
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Failed to start server'
    );
    process.exit(1);
  }
}

async function gracefulShutdown(): Promise<void> {
  try {
    logger.info('Shutting down gracefully...');

    if (app) {
      await app.close();
      logger.info('Server closed');
    }

    await closeDatabase();
    logger.info('Database closed');

    process.exit(0);
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Error during graceful shutdown'
    );
    process.exit(1);
  }
}

// Handle signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error(
    {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    },
    'Uncaught exception'
  );
  gracefulShutdown();
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  logger.error(
    {
      error: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    },
    'Unhandled promise rejection'
  );
  gracefulShutdown();
});

startServer();

export default app;
