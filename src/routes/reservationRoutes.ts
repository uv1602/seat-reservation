import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ReservationService } from '../services/ReservationService';
import { ReservationRepository } from '../repositories/ReservationRepository';
import { ShowRepository } from '../repositories/ShowRepository';
import { AuthenticationError, AppError } from '../common/errors/AppError';
import { getMetrics } from '../utils/metrics';
import logger from '../utils/logger';

export async function registerReservationRoutes(app: FastifyInstance): Promise<void> {
  const reservationRepository = new ReservationRepository();
  const showRepository = new ShowRepository();
  const reservationService = new ReservationService(
    reservationRepository,
    showRepository
  );
  const metrics = getMetrics();

  /**
   * POST /shows/:id/reserve
   * Reserve seats (atomic, idempotent)
   */
  app.post<{
    Params: { id: string };
    Body: { seats: string[]; idempotency_key: string };
  }>(
    '/shows/:id/reserve',
    async (request: FastifyRequest<{ Params: { id: string }; Body: { seats: string[]; idempotency_key: string } }>, reply: FastifyReply) => {
      try {
        const { id: showId } = request.params as { id: string };
        const { seats, idempotency_key } = request.body as { seats: string[]; idempotency_key: string };
        const userId = request.userId;

        if (!userId) {
          throw new AuthenticationError('Missing authentication token');
        }

        const reservation = await reservationService.reserveSeats({
          showId,
          userId,
          seatCodes: seats,
          idempotencyKey: idempotency_key,
        });

        metrics.reservationsConfirmed.inc({ show_id: showId });

        logger.info(
          {
            correlationId: request.correlationId,
            userId,
            showId,
            reservationId: reservation.id,
            seatsCount: seats.length,
          },
          'Reservation confirmed'
        );

        reply.status(201).send({
          success: true,
          data: reservation,
          meta: {
            correlationId: request.correlationId,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        if (error instanceof AppError) {
          if (error.statusCode === 409) {
            metrics.reservationsDeclined.inc({
              show_id: request.params.id,
              reason: error.code,
            });
          }
          throw error;
        }
        throw error;
      }
    }
  );

  /**
   * GET /reservations/:id
   * Get reservation details
   */
  app.get<{ Params: { id: string } }>(
    '/reservations/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        const reservation = await reservationService.getReservation(id);

        reply.send({
          success: true,
          data: reservation,
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
   * POST /reservations/:id/cancel
   * Cancel a reservation
   */
  app.post<{ Params: { id: string } }>(
    '/reservations/:id/cancel',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        const userId = request.userId;

        if (!userId) {
          throw new AuthenticationError('Missing authentication token');
        }

        const reservation = await reservationService.cancelReservation(id);

        logger.info(
          {
            correlationId: request.correlationId,
            userId,
            reservationId: id,
          },
          'Reservation cancelled'
        );

        reply.send({
          success: true,
          data: {
            id: reservation.id,
            status: reservation.status,
          },
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
