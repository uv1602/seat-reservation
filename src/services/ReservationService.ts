import { ReservationRepository, ReserveSeatsOptions } from '../repositories/ReservationRepository';
import { ShowRepository } from '../repositories/ShowRepository';
import {
  ValidationError,
  NotFoundError,
  BusinessLogicError,
} from '../common/errors/AppError';
import logger from '../utils/logger';

export class ReservationService {
  constructor(
    private reservationRepository: ReservationRepository,
    private showRepository: ShowRepository
  ) {}

  async reserveSeats(options: Omit<ReserveSeatsOptions, 'pricePaise'> & { userId: string }) {
    const { showId, userId, seatCodes, idempotencyKey } = options;

    // Validate inputs
    if (!showId || !userId || !seatCodes || !idempotencyKey) {
      throw new ValidationError('Missing required fields', {
        required: ['showId', 'userId', 'seatCodes', 'idempotencyKey'],
      });
    }

    if (!Array.isArray(seatCodes) || seatCodes.length === 0) {
      throw new ValidationError('Seats must be a non-empty array');
    }

    if (seatCodes.length > 10) {
      throw new ValidationError('Cannot reserve more than 10 seats at once');
    }

    // Verify show exists and get price
    const show = await this.showRepository.findById(showId);
    if (!show) {
      throw new NotFoundError('Show', showId);
    }

    // Reserve seats
    return this.reservationRepository.reserveSeats({
      showId,
      userId,
      seatCodes,
      idempotencyKey,
      pricePaise: show.price_paise * seatCodes.length,
    });
  }

  async getReservation(reservationId: string) {
    if (!reservationId) {
      throw new ValidationError('Reservation ID is required');
    }

    const reservation = await this.reservationRepository.findById(reservationId);
    if (!reservation) {
      throw new NotFoundError('Reservation', reservationId);
    }

    return reservation;
  }

  async cancelReservation(reservationId: string) {
    if (!reservationId) {
      throw new ValidationError('Reservation ID is required');
    }

    return this.reservationRepository.cancel(reservationId);
  }
}
