import { ShowRepository } from '../repositories/ShowRepository';
import { ValidationError, NotFoundError, ConflictError } from '../common/errors/AppError';
import logger from '../utils/logger';

export class ShowService {
  constructor(private showRepository: ShowRepository) {}

  async createShow(
    name: string,
    seats: string[],
    pricePaise: number,
    perUserLimit?: number
  ) {
    // Validate inputs
    if (!name || !seats || !pricePaise) {
      throw new ValidationError('Missing required fields', {
        required: ['name', 'seats', 'price_paise'],
      });
    }

    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new ValidationError('Show name must be a non-empty string');
    }

    if (!Array.isArray(seats) || seats.length === 0) {
      throw new ValidationError('Seats must be a non-empty array');
    }

    if (seats.length > 1000) {
      throw new ValidationError('Cannot create show with more than 1000 seats');
    }

    if (typeof pricePaise !== 'number' || pricePaise < 0) {
      throw new ValidationError('Price must be a non-negative number');
    }

    const limit = perUserLimit || 4;
    if (typeof limit !== 'number' || limit < 1 || limit > seats.length) {
      throw new ValidationError(
        `Per-user limit must be between 1 and ${seats.length}`
      );
    }

    // Check for duplicates in seat codes
    const uniqueSeats = new Set(seats);
    if (uniqueSeats.size !== seats.length) {
      throw new ValidationError('Seat codes must be unique');
    }

    // Check if show already exists
    const existing = await this.showRepository.findByName(name);
    if (existing) {
      throw new ConflictError(`Show "${name}" already exists`);
    }

    try {
      const show = await this.showRepository.createShow(
        name,
        Array.from(uniqueSeats),
        pricePaise,
        limit
      );

      logger.info(
        { showId: show.id, name, seatsCount: seats.length },
        'Show created successfully'
      );

      return {
        id: show.id,
        name: show.name,
        total_seats: show.total_seats,
        price_paise: show.price_paise,
        per_user_limit: show.per_user_limit,
        created_at: show.created_at,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        throw new ConflictError(`Show "${name}" already exists`);
      }
      throw error;
    }
  }

  async getShow(showId: string) {
    if (!showId) {
      throw new ValidationError('Show ID is required');
    }

    const show = await this.showRepository.findById(showId);
    if (!show) {
      throw new NotFoundError('Show', showId);
    }

    return {
      id: show.id,
      name: show.name,
      total_seats: show.total_seats,
      price_paise: show.price_paise,
      per_user_limit: show.per_user_limit,
      created_at: show.created_at,
      seats: show.seats.map((s) => ({
        id: s.id,
        seat_code: s.seat_code,
        status: s.status,
        holder_user_id: s.holder_user_id,
      })),
    };
  }

  async getShowStats(showId: string) {
    if (!showId) {
      throw new ValidationError('Show ID is required');
    }

    const show = await this.showRepository.findById(showId);
    if (!show) {
      throw new NotFoundError('Show', showId);
    }

    const status = await this.showRepository.getSeatStatus(showId);

    const totalAccounted = status.available + status.confirmed + status.held;
    const reconciliationHolds = totalAccounted === show.total_seats;

    return {
      show_id: show.id,
      show_name: show.name,
      available_seats: status.available,
      confirmed_seats: status.confirmed,
      held_seats: status.held,
      total_seats: show.total_seats,
      invariant_holds: reconciliationHolds,
      accounting: {
        total: show.total_seats,
        accounted: totalAccounted,
        orphaned: show.total_seats - totalAccounted,
      },
    };
  }
}
