# Masters Auction Leaderboard

A real-time leaderboard for a Masters Tournament auction pool, built on Cloudflare's developer platform.

## Features

- **Live Leaderboard** — Golf scores update every ~8 minutes from ESPN
- **Projected Payouts** — Real-time payout calculations based on current standings
- **Participant View** — See each person's golfers, spending, and net winnings
- **WebSocket Updates** — Browsers get pushed updates automatically
- **Mobile Friendly** — Responsive design works on all devices

## Architecture

| Component | Cloudflare Service |
|---|---|
| API + Routing | Workers (Hono) |
| Database | D1 (SQLite) |
| Real-time Push | Durable Objects (WebSocket) |
| Async Processing | Queues |
| Data Ingestion | Cron Triggers (every 8 min) |
| Frontend | Workers Static Assets (Astro + Preact) |

## Payout Structure

| Category | % of Pot |
|---|---|
| Making the Cut | 25% (split among all cut-makers) |
| Sunday Top 10 | 47% (15/7.5/6/5/4/3/2.5/2/1/1) |
| Saturday Top 10 | 20% (5/3/2/2/2/2/1/1/1/1) |
| Low Amateur | 1.2% |
| Pre-Cut High Total | 1.6% |
| Post-Cut Rd High | 1.6% |
| Best Putting | 1.2% |
| Best Driving | 1.2% |
| Best GIR | 1.2% |

Ties are handled by summing the payouts for all tied positions and dividing equally.

## Setup

### Prerequisites

- Node.js 18+
- Cloudflare account (free tier works)
- Wrangler CLI (`npm install -g wrangler`)

### Local Development

```bash
# Install dependencies
npm install
cd frontend && npm install && cd ..

# Create local D1 database and run migrations
npm run db:migrate

# Build frontend
npm run build:frontend

# Start dev server
npm run dev
```

### Create Tournament & Upload Auction Data

```bash
# Create a tournament
curl -X POST http://localhost:8787/api/admin/tournament \
  -H "Content-Type: application/json" \
  -d '{"year": 2026, "total_pot": 10000}'

# Upload auction CSV
curl -X POST "http://localhost:8787/api/admin/upload-auction?tournament_id=1" \
  -H "Content-Type: text/csv" \
  --data-binary @auction.csv
```

**CSV Format:**
```csv
participant,golfer,price
John Smith,Scottie Scheffler,450
John Smith,Rory McIlroy,380
Jane Doe,Jon Rahm,320
```

Or use JSON:
```bash
curl -X POST http://localhost:8787/api/admin/upload-auction \
  -H "Content-Type: application/json" \
  -d '{
    "tournament_id": 1,
    "purchases": [
      {"participant": "John Smith", "golfer": "Scottie Scheffler", "price": 450},
      {"participant": "Jane Doe", "golfer": "Jon Rahm", "price": 320}
    ]
  }'
```

### Deploy to Cloudflare

```bash
# Login to Cloudflare
wrangler login

# Create D1 database (update wrangler.toml with the returned ID)
wrangler d1 create masters-auction-db

# Run migrations on production
npm run db:migrate:prod

# Deploy
npm run deploy
```

### Trigger Manual Data Ingestion

```bash
curl -X POST http://localhost:8787/api/admin/trigger-ingest
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/tournament` | Active tournament info |
| GET | `/api/leaderboard` | Golf leaderboard with ownership |
| GET | `/api/payouts` | Calculated payouts |
| GET | `/api/participants` | Participants with golfers & payouts |
| GET | `/api/ws` | WebSocket for live updates |
| POST | `/api/admin/tournament` | Create tournament |
| PUT | `/api/admin/tournament/:id/status` | Update tournament status |
| POST | `/api/admin/upload-auction` | Upload auction data (CSV or JSON) |
| POST | `/api/admin/trigger-ingest` | Manual data pull |

## Data Sources

1. **ESPN Golf API** (primary) — Free, no key needed, ~5-15 min delay
2. **Masters.com JSON feeds** (fallback) — Direct from the tournament site

The system tries ESPN first, falls back to Masters.com if ESPN fails.
