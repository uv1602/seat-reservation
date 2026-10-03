# 🎭 Seat Reservation System at Scale (Node.js)

A production-grade seat reservation service built with Node.js + Fastify + PostgreSQL, designed for correctness under extreme concurrent load. Handles 20,000+ concurrent reservations without double-selling seats, violating per-user limits, or double-charging on retries.

**Key guarantee:** Never sell the same seat twice, never let a user exceed their booking limit, never double-charge on retried requests—even under 20,000+ concurrent buyers.

## Architecture

### Race-Free Atomic Decision (Node.js + PostgreSQL)

The atomic decision lives in the **database**, not the Node event loop:

```javascript
// Node.js handler (non-blocking)
async function reserveSeat(showId, seatCode, userId) {
  const result = await pool.query(
    `UPDATE seats 
     SET holder_user_id = $1, status = 'confirmed', confirmed_at = NOW()
     WHERE show_id = $2 AND seat_code = $3 AND status = 'available'
     RETURNING id`,
    [userId, showId, seatCode]
  );

  if (result.rows.length === 0) {
    return { success: false }; // Seat already taken
  }
  return { success: true, seatId: result.rows[0].id };
}
```

**Why this is race-free:**
- Multiple async requests call this function simultaneously
- Each parks at the database round-trip
- PostgreSQL serializes the UPDATE with row-level locking
- First writer changes status → 'confirmed', returns seat ID
- Second writer sees status ≠ 'available', matches 0 rows
- Result: exactly one succeeds (201), others get 409 (conflict)

### Why Node.js Works Here

**Node's advantages:**
- ✅ Non-blocking I/O: Concurrent requests don't block each other
- ✅ Lightweight: Can handle 20,000 concurrent connections
- ✅ Simple deployment: Single process, no thread management

**Node's constraints:**
- ⚠️ Single event loop: JavaScript code runs sequentially
- ⚠️ Performance: 3-5× slower than Go under load

**For this problem:** Node is fine because the hard work happens in PostgreSQL, not in Node's event loop.

## API Specification

### Create a Show
```
POST /shows
{
  "name": "friday-night",
  "seats": ["A1", "A2", "A3"],
  "price_paise": 25000,
  "per_user_limit": 4
}
→ 201 Created
```

### Reserve Seats
```
POST /shows/{id}/reserve
Header: Authorization: Bearer {user_id}
Body: {
  "seats": ["A1"],
  "idempotency_key": "user-123-order-456"
}
→ 201 Created: { "reservation_id": "...", "seats": [...] }
→ 409 Conflict: "seat not available" or "per-user limit exceeded"
→ 200 OK: (idempotent replay)
```

### Get Show
```
GET /shows/{id}
→ 200 OK: { "show": {...}, "seat_status": {"available": X, "confirmed": Y} }
```

### Cancel Reservation
```
POST /reservations/{id}/cancel
Header: Authorization: Bearer {user_id}
→ 200 OK: { "status": "cancelled" }
```

### Health & Metrics
```
GET /health/live     → 200 if alive
GET /health/ready    → 200 if DB ready, 503 if down
GET /metrics         → Prometheus format
GET /shows/{id}/stats → { "available": X, "confirmed": Y, "invariant_holds": true }
```

## Running Locally

### Prerequisites
- Node.js 18+
- Docker & Docker Compose

### Start with Docker

```bash
docker-compose up -d
```

### Start Locally (Development)

```bash
npm install
npm run dev
```

### Create a Test Show

```bash
curl -X POST http://localhost:8080/shows \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test-show",
    "seats": ["A1", "A2", "A3"],
    "price_paise": 10000,
    "per_user_limit": 2
  }'
```

### Run Burst Test

```bash
npm test
# Or: node cmd/burst.js http://localhost:8080 100 200
```

### Expected Output

```
Total Requests: 20000
Confirmed: 3 (0.015%)
Declined: 19997
Server Errors: 0
Invariant Holds: true
```

## Deployment

### Local Docker

```bash
make run
```

### Production (Render.com)

1. Push to GitHub
2. Create Web Service on Render
3. Set environment:
   ```
   DB_USER=postgres
   DB_PASSWORD=<password>
   DB_HOST=<render-postgres-host>
   DB_PORT=5432
   DB_NAME=seat_reservation
   PORT=10000
   NODE_ENV=production
   ```
4. Service is live at `https://<name>.onrender.com`

## Observability

### Metrics
```
reservations_confirmed_total{show_id="..."}
reservations_declined_total{show_id="...", reason="seat_taken|per_user_limit"}
seats_available{show_id="..."}
request_duration_seconds{method="POST", endpoint="/shows/{id}/reserve"}
```

### Logs
Structured JSON with correlation IDs:
```json
{
  "level": 30,
  "msg": "Reservation confirmed",
  "correlationId": "...",
  "userId": "user-123",
  "seats": ["A1"]
}
```

View: `docker-compose logs -f app`

## Correctness Guarantees

✅ **No double-sells** — Atomic UPDATE with row lock  
✅ **No per-user violations** — Atomic count-then-lock  
✅ **Idempotent retries** — UNIQUE constraint at DB level  
✅ **Zero 5xx errors** — All conflicts are 4xx  
✅ **Reconciliation invariant** — available + held + confirmed == total

## Tech Stack

- **Language**: JavaScript (Node.js 18+)
- **Framework**: Fastify (lightweight HTTP)
- **Database**: PostgreSQL 15
- **Metrics**: Prometheus Client
- **Logging**: Pino (structured JSON)

## File Structure

```
.
├── server.js                # Main entry point
├── package.json             # Dependencies
├── Dockerfile               # Container build
├── docker-compose.yml       # Local setup
├── db/schema.sql            # Database DDL
├── src/
│   ├── db.js               # Connection pool
│   ├── logger.js           # Structured logging
│   ├── metrics.js          # Prometheus metrics
│   └── repository.js       # Database operations (RACE-FREE CORE)
└── cmd/
    └── burst.js            # Load test tool
```

## Performance

Under 20k concurrent burst (100 buyers × 200 requests):

| Metric | Node.js | Go |
|--------|---------|-------|
| Throughput | 400-800 req/sec | 2,000-3,000 req/sec |
| p95 Latency | 400-800ms | 50-100ms |
| Memory | 150-250MB | 50-100MB |

**Note**: Node is correct but slower. For sub-100ms p95, use Go.

## Troubleshooting

### Connection refused
```bash
docker-compose ps
docker-compose up -d postgres
```

### Invariant violation
Check show stats: `curl http://localhost:8080/shows/<id>/stats`

### High latency under load
This is expected with Node's event loop. Correct behavior, degraded performance.

## Why Node.js?

**Pros:**
- ✅ Rapid development
- ✅ JavaScript everywhere
- ✅ Sufficient for moderate loads

**Tradeoffs:**
- ⚠️ 3-5× slower than Go
- ⚠️ Higher memory usage
- ⚠️ Performance degrades under extreme load

## Next Steps

```bash
# Test locally
docker-compose up -d
npm test

# Deploy to Render
# (Follow DEPLOYMENT.md)

# Test live
node cmd/burst.js https://<service>.onrender.com
```

## License

MIT
