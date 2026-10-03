import { FastifyInstance } from 'fastify';

export async function registerSwaggerSchemas(app: FastifyInstance): Promise<void> {
  // Swagger schema documentation is auto-discovered from route definitions
  // in showRoutes.ts, reservationRoutes.ts, and healthRoutes.ts
  // This function is kept for future schema customizations if needed
}
