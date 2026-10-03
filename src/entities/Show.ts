import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Seat } from './Seat';
import { Reservation } from './Reservation';

@Entity('shows')
@Index(['name'], { unique: true })
export class Show {
  @PrimaryColumn('uuid')
  id: string;

  @Column('text')
  name: string;

  @Column('integer')
  total_seats: number;

  @Column('bigint')
  price_paise: number;

  @Column('integer', { default: 4 })
  per_user_limit: number;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @OneToMany(() => Seat, (seat) => seat.show, { cascade: true })
  seats: Seat[];

  @OneToMany(() => Reservation, (reservation) => reservation.show, {
    cascade: true,
  })
  reservations: Reservation[];
}
