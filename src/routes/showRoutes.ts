import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ShowService } from '../services/ShowService';
import { ShowRepository } from '../repositories/ShowRepository';
import { ValidationError, AppError } from '../common/errors/AppError';
import { getMetrics } from '../utils/metrics';
import logger from '../utils/logger';

export async function registerShowRoutes(app: FastifyInstance): Promise<void> {
  const showRepository = new ShowRepository();
  const showService = new ShowService(showRepository);
  const metrics = getMetrics();

  /**
   * POST /shows
   * Create a new show
   */
  app.post<{ Body: { name: string; seats: string[]; price_paise: number; per_user_limit?: number } }>(
    '/shows',
    async (request: FastifyRequest<{ Body: { name: string; seats: string[]; price_paise: number; per_user_limit?: number } }>, reply: FastifyReply) => {
      try {
        const { name, seats, price_paise, per_user_limit } = request.body as { name: string; seats: string[]; price_paise: number; per_user_limit?: number };

        const show = await showService.createShow(
          name,
          seats,
          price_paise,
          per_user_limit
        );

        metrics.seatsAvailable.set({ show_id: show.id }, seats.length);

        logger.info(
          {
            correlationId: request.correlationId,
            showId: show.id,
            seatsCount: seats.length,
          },
          'Show created'
        );

        reply.status(201).send({
          success: true,
          data: show,
          meta: {
            correlationId: request.correlationId,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }
        throw error;
      }
    }
  );

  /**
   * GET /shows/:id
   * Get show details with seat status
   */
  app.get<{ Params: { id: string } }>(
    '/shows/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        const show = await showService.getShow(id);

        // Update metrics
        const available = show.seats.filter((s) => s.status === 'available').length;
        const confirmed = show.seats.filter((s) => s.status === 'confirmed').length;
        const held = show.seats.filter((s) => s.status === 'held').length;

        metrics.seatsAvailable.set({ show_id: id }, available);
        metrics.seatsConfirmed.set({ show_id: id }, confirmed);
        metrics.seatsHeld.set({ show_id: id }, held);

        reply.send({
          success: true,
          data: show,
          meta: {
            correlationId: request.correlationId,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        throw error;
      }
    }
  );

  /**
   * GET /shows/:id/stats
   * Get show statistics and verify reconciliation
   */
  app.get<{ Params: { id: string } }>(
    '/shows/:id/stats',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        const stats = await showService.getShowStats(id);

        if (!stats.invariant_holds) {
          logger.error(
            {
              correlationId: request.correlationId,
              showId: id,
              accounting: stats.accounting,
            },
            'INVARIANT VIOLATION DETECTED'
          );
        }

        reply.send({
          success: true,
          data: stats,
          meta: {
            correlationId: request.correlationId,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        throw error;
      }
    }
  );
}
