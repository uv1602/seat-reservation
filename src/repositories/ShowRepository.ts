import { Repository } from 'typeorm';
import { AppDataSource } from '../database/data-source';
import { Show, Seat, SeatStatus } from '../entities';
import { DatabaseError, NotFoundError } from '../common/errors/AppError';
import logger from '../utils/logger';
import { v4 as uuid } from 'uuid';

export class ShowRepository {
  private showRepo: Repository<Show>;
  private seatRepo: Repository<Seat>;

  constructor() {
    this.showRepo = AppDataSource.getRepository(Show);
    this.seatRepo = AppDataSource.getRepository(Seat);
  }

  async createShow(
    name: string,
    seats: string[],
    pricePaise: number,
    perUserLimit: number = 4
  ): Promise<Show> {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('SERIALIZABLE');

    try {
      const showId = uuid();
      const now = new Date();

      // Create show
      const show = new Show();
      show.id = showId;
      show.name = name;
      show.total_seats = seats.length;
      show.price_paise = pricePaise;
      show.per_user_limit = perUserLimit;
      show.created_at = now;

      await queryRunner.manager.save(show);

      // Create all seats
      const seatEntities = seats.map((seatCode) => {
        const seat = new Seat();
        seat.id = uuid();
        seat.show_id = showId;
        seat.seat_code = seatCode;
        seat.status = SeatStatus.AVAILABLE;
        seat.created_at = now;
        return seat;
      });

      await queryRunner.manager.save(seatEntities);

      await queryRunner.commitTransaction();

      logger.info(
        { showId, name, seatsCount: seats.length },
        'Show created successfully'
      );

      return show;
    } catch (error) {
      await queryRunner.rollbackTransaction();

      if (error instanceof Error && error.message.includes('duplicate')) {
        logger.warn({ name }, 'Show with this name already exists');
        throw new DatabaseError(`Show "${name}" already exists`, error);
      }

      logger.error(
        { error: error instanceof Error ? error.message : String(error), name },
        'Failed to create show'
      );
      throw new DatabaseError('Failed to create show', error);
    } finally {
      await queryRunner.release();
    }
  }

  async findById(id: string): Promise<Show | null> {
    try {
      const show = await this.showRepo.findOne({
        where: { id },
        relations: ['seats'],
      });
      return show || null;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error), showId: id },
        'Failed to fetch show'
      );
      throw new DatabaseError('Failed to fetch show', error);
    }
  }

  async findByName(name: string): Promise<Show | null> {
    try {
      const show = await this.showRepo.findOne({
        where: { name },
      });
      return show || null;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error), name },
        'Failed to find show by name'
      );
      throw new DatabaseError('Failed to find show', error);
    }
  }

  async getSeatStatus(showId: string): Promise<{ available: number; held: number; confirmed: number }> {
    try {
      const show = await this.showRepo.findOne({
        where: { id: showId },
        relations: ['seats'],
      });

      if (!show) {
        throw new NotFoundError('Show', showId);
      }

      return {
        available: show.seats.filter((s) => s.status === SeatStatus.AVAILABLE).length,
        held: show.seats.filter((s) => s.status === SeatStatus.HELD).length,
        confirmed: show.seats.filter((s) => s.status === SeatStatus.CONFIRMED).length,
      };
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      logger.error(
        { error: error instanceof Error ? error.message : String(error), showId },
        'Failed to get seat status'
      );
      throw new DatabaseError('Failed to get seat status', error);
    }
  }
}
