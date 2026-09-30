# Masters Auction Leaderboard

A real-time leaderboard for a Masters Tournament auction pool, built on Cloudflare's developer platform.

## Features

- **Live Leaderboard** — Golf scores can be refreshed from ESPN; scheduled refreshes are currently disabled
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

- Node.js 24
- Cloudflare account (free tier works)
- `cf` and Wrangler are pinned as project development dependencies

### Local Development

```bash
# Install dependencies
npm install
cd frontend && npm install && cd ..

# Create local D1 database and run migrations
npm run db:migrate

# Build frontend
npm run build:frontend

# Start dev server (cf uses Wrangler for the Worker build)
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

### Staging and production

This repository has two long-lived branches. `staging` deploys the `masters-auction-staging`
Worker; `main` deploys the `masters-auction` production Worker. Promote a validated
staging commit to `main` when ready. The workers use separate D1 databases, Queues,
and Durable Object namespaces. The staging Worker does not use the production domain.
Both Workers have their `workers.dev` routes disabled. Attach the staging custom
domain with Cloudflare Access protection before opening the staging admin UI.

Workers Builds should run `npm run build:staging` followed by
`npx cf deploy --mode staging` for `staging`. Production should run
`npm run build` followed by `npx cf deploy` after the migration reaches `main`.
For local verification, run `npm run build:staging` or `npm run build`.

Apply schema migrations to staging with `npm run db:migrate:staging` before
deploying schema-dependent changes. Production migrations require a separate
review and are applied with `npm run db:migrate:prod` when promoting.

Cron Triggers are disabled in both workers. When tournament rehearsals begin,
add a schedule only to the staging mode and verify ingestion and payout updates
there before scheduling production. The staging Queue consumer runs on its own
Worker; Worker Previews do not support Queue consumers or Cron Triggers.

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
