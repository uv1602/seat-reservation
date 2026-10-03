import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  OneToMany,
  Index,
  CreateDateColumn,
} from 'typeorm';
import { Show } from './Show';
import { ReservationSeat } from './ReservationSeat';

export enum SeatStatus {
  AVAILABLE = 'available',
  HELD = 'held',
  CONFIRMED = 'confirmed',
}

@Entity('seats')
@Index(['show_id', 'seat_code'], { unique: true })
@Index(['show_id', 'status'])
@Index(['show_id', 'holder_user_id'])
@Index(['show_id', 'expires_at'])
export class Seat {
  @PrimaryColumn('uuid')
  id: string;

  @Column('uuid')
  show_id: string;

  @ManyToOne(() => Show, (show) => show.seats, {
    onDelete: 'CASCADE',
    eager: false,
  })
  show: Show;

  @Column('text')
  seat_code: string;

  @Column('text', { default: SeatStatus.AVAILABLE })
  status: SeatStatus;

  @Column('text', { nullable: true })
  holder_user_id: string | null;

  @Column('timestamp', { nullable: true })
  reserved_at: Date | null;

  @Column('timestamp', { nullable: true })
  confirmed_at: Date | null;

  @Column('timestamp', { nullable: true })
  expires_at: Date | null;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @OneToMany(() => ReservationSeat, (reservationSeat) => reservationSeat.seat)
  reservationSeats: ReservationSeat[];
}
