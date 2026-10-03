const http = require('http');
const { URL } = require('url');

// Parse command line arguments
const baseUrl = process.argv[2] || 'http://localhost:8080';
const numBuyers = parseInt(process.argv[3]) || 100;
const numRequests = parseInt(process.argv[4]) || 200;
const hotSeatPct = parseFloat(process.argv[5] || '0.5');
const numSeats = parseInt(process.argv[6] || '50');

console.log('🎭 Seat Reservation Burst Test');
console.log('================================');
console.log(`URL: ${baseUrl}`);
console.log(`Buyers: ${numBuyers}`);
console.log(`Requests per buyer: ${numRequests}`);
console.log(`Hot seat percentage: ${(hotSeatPct * 100).toFixed(0)}%`);
console.log(`Total seats: ${numSeats}\n`);

// Generate seat codes
function generateSeats(count) {
  const seats = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / 10);
    const col = (i % 10) + 1;
    seats.push(`${String.fromCharCode(65 + row)}${col}`);
  }
  return seats;
}

// Get hot seats
function getHotSeats(seats, count) {
  const shuffled = [...seats].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// Make HTTP request
function makeRequest(method, path, body, authToken) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
        'X-Correlation-ID': `${authToken}-${Date.now()}`,
      },
    };

    const protocol = url.protocol === 'https:' ? require('https') : http;
    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: data ? JSON.parse(data) : null,
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// Create show
async function createShow() {
  const seats = generateSeats(numSeats);
  const showName = `test-show-${Date.now()}`;

  const response = await makeRequest('POST', '/shows', {
    name: showName,
    seats,
    price_paise: 25000,
    per_user_limit: 4,
  });

  if (response.statusCode !== 201) {
    throw new Error(`Failed to create show: ${response.statusCode}`);
  }

  return {
    showId: response.body.id,
    seats,
  };
}

// Attempt reservation
async function attemptReservation(showId, userId, seatCodes, idempotencyKey) {
  try {
    const response = await makeRequest('POST', `/shows/${showId}/reserve`, {
      seats: seatCodes,
      idempotency_key: idempotencyKey,
    });

    return {
      statusCode: response.statusCode,
      success: response.statusCode === 201 || response.statusCode === 200,
      declined: response.statusCode === 409,
      error: response.statusCode >= 500,
    };
  } catch (err) {
    return { statusCode: 0, success: false, declined: false, error: true };
  }
}

// Run burst
async function runBurst(showId, seats, hotSeats) {
  const results = {
    confirmed: 0,
    declined: 0,
    errors: 0,
    total: 0,
  };

  const promises = [];

  for (let buyerId = 0; buyerId < numBuyers; buyerId++) {
    const userId = `user-${buyerId}`;

    for (let reqId = 0; reqId < numRequests; reqId++) {
      const promise = (async () => {
        // Select target seat
        let targetSeats = [];
        if (Math.random() < hotSeatPct && hotSeats.length > 0) {
          targetSeats = [hotSeats[Math.floor(Math.random() * hotSeats.length)]];
        } else {
          const row = Math.floor(Math.random() * 5);
          const col = Math.floor(Math.random() * 10) + 1;
          targetSeats = [`${String.fromCharCode(65 + row)}${col}`];
        }

        const idempotencyKey = `${userId}-req-${reqId}`;

        try {
          const result = await attemptReservation(showId, userId, targetSeats, idempotencyKey);

          results.total++;
          if (result.success) {
            results.confirmed++;
          } else if (result.declined) {
            results.declined++;
          } else if (result.error) {
            results.errors++;
          } else {
            results.declined++;
          }
        } catch (err) {
          results.total++;
          results.errors++;
        }

        // Small delay to avoid overwhelming
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 10));
      })();

      promises.push(promise);
    }
  }

  console.log('🚀 Starting burst test...');
  const startTime = Date.now();

  await Promise.all(promises);

  const duration = (Date.now() - startTime) / 1000;

  return { ...results, duration };
}

// Get reconciliation
async function getReconciliation(showId) {
  try {
    const response = await makeRequest('GET', `/shows/${showId}/stats`, null);
    return response.body;
  } catch (err) {
    return { error: err.message };
  }
}

// Main
(async () => {
  try {
    // Create show
    const { showId, seats } = await createShow();
    console.log(`✅ Created show: ${showId}`);
    console.log(`   Seats: ${numSeats}, Price: 25000 paise, Per-user limit: 4\n`);

    // Get hot seats
    const hotSeats = getHotSeats(seats, Math.floor(numSeats * 0.2));
    console.log(`🔥 Hot seats (${hotSeats.length}): ${hotSeats.slice(0, 5).join(', ')}...\n`);

    // Run burst
    const results = await runBurst(showId, seats, hotSeats);

    // Get reconciliation
    const stats = await getReconciliation(showId);

    // Print results
    console.log('\n📊 Results');
    console.log('==========');
    console.log(`Total Requests:        ${results.total}`);
    console.log(`Duration:              ${results.duration.toFixed(2)} seconds`);
    console.log(`Throughput:            ${(results.total / results.duration).toFixed(0)} req/sec\n`);

    console.log(
      `✅ Confirmed:          ${results.confirmed} (${((results.confirmed / results.total) * 100).toFixed(2)}%)`
    );
    console.log(`❌ Declined:           ${results.declined}`);
    console.log(`🔴 Server Errors:      ${results.errors}\n`);

    console.log('📋 Reconciliation');
    console.log('=================');
    console.log(`Available Seats:       ${stats.available_seats}`);
    console.log(`Held Seats:            ${stats.held_seats}`);
    console.log(`Confirmed Seats:       ${stats.confirmed_seats}`);
    console.log(`Total Seats:           ${stats.total_seats}`);
    console.log(`Invariant Holds:       ${stats.invariant_holds ? '✅ true' : '❌ false'}`);

    console.log('\n💾 Results saved');
    console.log(JSON.stringify(results, null, 2));
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
