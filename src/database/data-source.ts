import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Show, Seat, Reservation, ReservationSeat } from '../entities';
import logger from '../utils/logger';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'seat_reservation',
  synchronize: false,
  logging: false,
  entities: [Show, Seat, Reservation, ReservationSeat],
  poolSize: 20,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

export async function initializeDatabase(): Promise<void> {
  try {
    if (AppDataSource.isInitialized) {
      logger.info('Database already initialized');
      return;
    }

    await AppDataSource.initialize();
    logger.info('Database connected successfully');

    // Run migrations (if any)
    // await AppDataSource.runMigrations();
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to initialize database'
    );
    throw error;
  }
}

export async function closeDatabase(): Promise<void> {
  try {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
      logger.info('Database connection closed');
    }
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Error closing database connection'
    );
    throw error;
  }
}
