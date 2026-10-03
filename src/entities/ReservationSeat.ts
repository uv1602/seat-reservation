import { Entity, ManyToOne, PrimaryColumn, Index } from 'typeorm';
import { Reservation } from './Reservation';
import { Seat } from './Seat';

@Entity('reservation_seats')
@Index(['reservation_id', 'seat_id'], { unique: true })
export class ReservationSeat {
  @PrimaryColumn('uuid')
  reservation_id: string;

  @ManyToOne(() => Reservation, (reservation) => reservation.reservationSeats, {
    onDelete: 'CASCADE',
    eager: false,
  })
  reservation: Reservation;

  @PrimaryColumn('uuid')
  seat_id: string;

  @ManyToOne(() => Seat, (seat) => seat.reservationSeats, {
    onDelete: 'CASCADE',
    eager: false,
  })
  seat: Seat;
}
