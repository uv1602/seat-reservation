import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Show } from './Show';
import { ReservationSeat } from './ReservationSeat';

export enum ReservationStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
}

@Entity('reservations')
@Index(['show_id', 'user_id', 'idempotency_key'], { unique: true })
@Index(['user_id', 'show_id'])
@Index(['show_id', 'status'])
export class Reservation {
  @PrimaryColumn('uuid')
  id: string;

  @Column('uuid')
  show_id: string;

  @ManyToOne(() => Show, (show) => show.reservations, {
    onDelete: 'CASCADE',
    eager: false,
  })
  show: Show;

  @Column('text')
  user_id: string;

  @Column('text')
  idempotency_key: string;

  @Column('text', { default: ReservationStatus.PENDING })
  status: ReservationStatus;

  @Column('bigint')
  amount_paise: number;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @OneToMany(
    () => ReservationSeat,
    (reservationSeat) => reservationSeat.reservation,
    { cascade: true }
  )
  reservationSeats: ReservationSeat[];
}
