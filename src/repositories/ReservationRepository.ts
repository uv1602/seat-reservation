import { Repository } from 'typeorm';
import { AppDataSource } from '../database/data-source';
import {
  Reservation,
  Seat,
  Show,
  ReservationSeat,
  SeatStatus,
  ReservationStatus,
} from '../entities';
import {
  DatabaseError,
  NotFoundError,
  ConflictError,
  BusinessLogicError,
} from '../common/errors/AppError';
import logger from '../utils/logger';
import { v4 as uuid } from 'uuid';

export interface ReserveSeatsOptions {
  showId: string;
  userId: string;
  seatCodes: string[];
  idempotencyKey: string;
  pricePaise: number;
}

export interface ReservationResult {
  id: string;
  show_id: string;
  user_id: string;
  status: ReservationStatus;
  seats: string[];
  amount_paise: number;
  created_at: Date;
}

export class ReservationRepository {
  private reservationRepo: Repository<Reservation>;
  private seatRepo: Repository<Seat>;
  private showRepo: Repository<Show>;

  constructor() {
    this.reservationRepo = AppDataSource.getRepository(Reservation);
    this.seatRepo = AppDataSource.getRepository(Seat);
    this.showRepo = AppDataSource.getRepository(Show);
  }

  /**
   * Atomic reservation with race-free guarantees using SERIALIZABLE transactions
   * and row-level locks (pessimistic_write / FOR UPDATE)
   */
  async reserveSeats(options: ReserveSeatsOptions): Promise<ReservationResult> {
    const { showId, userId, seatCodes, idempotencyKey, pricePaise } = options;
    const queryRunner = AppDataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction('SERIALIZABLE');

    try {
      // Check for idempotency (duplicate request)
      const existingReservation = await queryRunner.manager.findOne(
        Reservation,
        {
          where: {
            show_id: showId,
            user_id: userId,
            idempotency_key: idempotencyKey,
          },
          relations: ['reservationSeats', 'reservationSeats.seat'],
        }
      );

      if (existingReservation) {
        logger.info(
          { showId, userId, idempotencyKey },
          'Idempotent reservation replay detected, returning existing reservation'
        );

        await queryRunner.rollbackTransaction();

        return {
          id: existingReservation.id,
          show_id: existingReservation.show_id,
          user_id: existingReservation.user_id,
          status: existingReservation.status,
          seats: existingReservation.reservationSeats.map((rs) => rs.seat.seat_code),
          amount_paise: existingReservation.amount_paise,
          created_at: existingReservation.created_at,
        };
      }

      // Get show
      const show = await queryRunner.manager.findOne(Show, {
        where: { id: showId },
      });

      if (!show) {
        throw new NotFoundError('Show', showId);
      }

      // Check per-user limit
      const userConfirmedCount = await queryRunner.manager.count(Seat, {
        where: {
          show_id: showId,
          holder_user_id: userId,
          status: SeatStatus.CONFIRMED,
        },
      });

      if (userConfirmedCount + seatCodes.length > show.per_user_limit) {
        throw new BusinessLogicError(
          `Exceeded per-user limit of ${show.per_user_limit} seats`,
          {
            currentCount: userConfirmedCount,
            requestedCount: seatCodes.length,
            limit: show.per_user_limit,
          }
        );
      }

      // Get seats with row-level lock (atomic - no race condition)
      const seats = await queryRunner.manager
        .createQueryBuilder(Seat, 'seat')
        .setLock('pessimistic_write')
        .where('seat.show_id = :showId', { showId })
        .andWhere('seat.seat_code IN (:...seatCodes)', { seatCodes })
        .orderBy('seat.seat_code', 'ASC')
        .getMany();

      if (seats.length !== seatCodes.length) {
        const notFoundCodes = seatCodes.filter(
          (code) => !seats.some((s) => s.seat_code === code)
        );
        throw new NotFoundError(
          `Seats ${notFoundCodes.join(', ')}`,
          showId
        );
      }

      // Verify all seats are available
      const unavailableSeats = seats.filter(
        (s) => s.status !== SeatStatus.AVAILABLE
      );

      if (unavailableSeats.length > 0) {
        throw new ConflictError(
          `Seats ${unavailableSeats.map((s) => s.seat_code).join(', ')} are not available`,
          {
            unavailableSeats: unavailableSeats.map((s) => ({
              code: s.seat_code,
              status: s.status,
              holder_user_id: s.holder_user_id,
            })),
          }
        );
      }

      // Update all seats atomically
      const now = new Date();

      for (const seat of seats) {
        seat.status = SeatStatus.CONFIRMED;
        seat.holder_user_id = userId;
        seat.confirmed_at = now;
        await queryRunner.manager.save(seat);
      }

      // Create reservation
      const reservationId = uuid();
      const reservation = new Reservation();
      reservation.id = reservationId;
      reservation.show_id = showId;
      reservation.user_id = userId;
      reservation.idempotency_key = idempotencyKey;
      reservation.status = ReservationStatus.CONFIRMED;
      reservation.amount_paise = pricePaise;
      reservation.created_at = now;

      await queryRunner.manager.save(reservation);

      // Link seats to reservation
      for (const seat of seats) {
        const reservationSeat = new ReservationSeat();
        reservationSeat.reservation_id = reservationId;
        reservationSeat.seat_id = seat.id;
        await queryRunner.manager.save(reservationSeat);
      }

      await queryRunner.commitTransaction();

      logger.info(
        { showId, userId, reservationId, seatsCount: seats.length },
        'Reservation confirmed'
      );

      return {
        id: reservationId,
        show_id: showId,
        user_id: userId,
        status: ReservationStatus.CONFIRMED,
        seats: seats.map((s) => s.seat_code),
        amount_paise: pricePaise,
        created_at: now,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();

      if (error instanceof DatabaseError || error instanceof BusinessLogicError || error instanceof ConflictError || error instanceof NotFoundError) {
        throw error;
      }

      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          showId,
          userId,
          seatCodes,
        },
        'Failed to reserve seats'
      );

      throw new DatabaseError('Failed to reserve seats', error);
    } finally {
      await queryRunner.release();
    }
  }

  async findById(id: string): Promise<ReservationResult | null> {
    try {
      const reservation = await this.reservationRepo.findOne({
        where: { id },
        relations: ['reservationSeats', 'reservationSeats.seat'],
      });

      if (!reservation) {
        return null;
      }

      return {
        id: reservation.id,
        show_id: reservation.show_id,
        user_id: reservation.user_id,
        status: reservation.status,
        seats: reservation.reservationSeats.map((rs) => rs.seat.seat_code),
        amount_paise: reservation.amount_paise,
        created_at: reservation.created_at,
      };
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error), reservationId: id },
        'Failed to fetch reservation'
      );
      throw new DatabaseError('Failed to fetch reservation', error);
    }
  }

  async cancel(reservationId: string): Promise<ReservationResult> {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('SERIALIZABLE');

    try {
      const reservation = await queryRunner.manager.findOne(Reservation, {
        where: { id: reservationId },
        relations: ['reservationSeats', 'reservationSeats.seat'],
      });

      if (!reservation) {
        throw new NotFoundError('Reservation', reservationId);
      }

      if (reservation.status === ReservationStatus.CANCELLED) {
        logger.info(
          { reservationId },
          'Reservation already cancelled, returning existing state'
        );
        await queryRunner.rollbackTransaction();

        return {
          id: reservation.id,
          show_id: reservation.show_id,
          user_id: reservation.user_id,
          status: reservation.status,
          seats: reservation.reservationSeats.map((rs) => rs.seat.seat_code),
          amount_paise: reservation.amount_paise,
          created_at: reservation.created_at,
        };
      }

      // Release all seats
      for (const rs of reservation.reservationSeats) {
        rs.seat.status = SeatStatus.AVAILABLE;
        rs.seat.holder_user_id = null;
        rs.seat.confirmed_at = null;
        await queryRunner.manager.save(rs.seat);
      }

      // Mark reservation as cancelled
      reservation.status = ReservationStatus.CANCELLED;
      await queryRunner.manager.save(reservation);

      await queryRunner.commitTransaction();

      logger.info(
        { reservationId, userId: reservation.user_id },
        'Reservation cancelled'
      );

      return {
        id: reservation.id,
        show_id: reservation.show_id,
        user_id: reservation.user_id,
        status: reservation.status,
        seats: reservation.reservationSeats.map((rs) => rs.seat.seat_code),
        amount_paise: reservation.amount_paise,
        created_at: reservation.created_at,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();

      if (error instanceof NotFoundError || error instanceof DatabaseError) {
        throw error;
      }

      logger.error(
        { error: error instanceof Error ? error.message : String(error), reservationId },
        'Failed to cancel reservation'
      );

      throw new DatabaseError('Failed to cancel reservation', error);
    } finally {
      await queryRunner.release();
    }
  }
}
