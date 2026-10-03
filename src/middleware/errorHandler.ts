import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError, InternalServerError, ValidationError } from '../common/errors/AppError';
import logger from '../utils/logger';

export async function registerErrorHandler(app: FastifyInstance): Promise<void> {
  app.setErrorHandler(async (error, request, reply) => {
    const correlationId = request.correlationId || 'unknown';
    const requestContext = {
      correlationId,
      path: request.url,
      method: request.method,
      userId: request.userId,
    };

    if (error instanceof AppError) {
      logger.warn(
        {
          ...requestContext,
          errorCode: error.code,
          statusCode: error.statusCode,
        },
        error.message
      );

      reply.status(error.statusCode).send({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details && { details: error.details }),
        },
        meta: {
          correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    } else if (error instanceof ValidationError) {
      logger.warn(
        { ...requestContext, details: error.details },
        'Validation error'
      );

      reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message,
          details: error.details,
        },
        meta: {
          correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    } else if (error.statusCode === 400) {
      // Handle Fastify's built-in validation errors
      logger.warn({ ...requestContext }, error.message);

      reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message,
        },
        meta: {
          correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    } else {
      // Unexpected error
      logger.error(
        {
          ...requestContext,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        'Unexpected error'
      );

      const internalError = new InternalServerError(
        'An unexpected error occurred',
        error
      );

      reply.status(500).send({
        success: false,
        error: {
          code: internalError.code,
          message: internalError.message,
        },
        meta: {
          correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }
  });
}

export function createErrorHandler(
  callback: (error: AppError | Error) => AppError
) {
  return (error: AppError | Error): AppError => {
    if (error instanceof AppError) {
      return error;
    }
    return callback(error);
  };
}
