import {
  Counter,
  Gauge,
  Histogram,
  register as prometheusRegister,
} from 'prom-client';

let metricsInstance: Metrics | null = null;

class Metrics {
  requestDuration: Histogram;
  concurrentRequests: Gauge;
  reservationsConfirmed: Counter;
  reservationsDeclined: Counter;
  seatsAvailable: Gauge;
  seatsConfirmed: Gauge;
  seatsHeld: Gauge;
  errors: Counter;
  register: typeof prometheusRegister;

  constructor() {
    this.register = prometheusRegister;

    this.requestDuration = new Histogram({
      name: 'seat_reservation_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'endpoint'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
    });

    this.concurrentRequests = new Gauge({
      name: 'seat_reservation_concurrent_requests',
      help: 'Number of concurrent HTTP requests',
      labelNames: ['endpoint'],
    });

    this.reservationsConfirmed = new Counter({
      name: 'seat_reservation_confirmed_total',
      help: 'Total number of confirmed reservations',
      labelNames: ['show_id'],
    });

    this.reservationsDeclined = new Counter({
      name: 'seat_reservation_declined_total',
      help: 'Total number of declined reservations',
      labelNames: ['show_id', 'reason'],
    });

    this.seatsAvailable = new Gauge({
      name: 'seat_reservation_seats_available',
      help: 'Number of available seats',
      labelNames: ['show_id'],
    });

    this.seatsConfirmed = new Gauge({
      name: 'seat_reservation_seats_confirmed',
      help: 'Number of confirmed seats',
      labelNames: ['show_id'],
    });

    this.seatsHeld = new Gauge({
      name: 'seat_reservation_seats_held',
      help: 'Number of held seats',
      labelNames: ['show_id'],
    });

    this.errors = new Counter({
      name: 'seat_reservation_errors_total',
      help: 'Total number of errors',
      labelNames: ['type', 'endpoint'],
    });
  }
}

export function getMetrics(): Metrics {
  if (!metricsInstance) {
    metricsInstance = new Metrics();
  }
  return metricsInstance;
}

export function resetMetrics(): void {
  metricsInstance = null;
}
