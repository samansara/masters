import { Hono } from 'hono';
import type { Env, PayoutQueueMessage } from './types';
import { api } from './api/routes';
import { ingestGolfData } from './services/ingest';
import { calculatePayouts } from './services/payouts';
import {
  getActiveTournament,
  getGolferScores,
  getPurchases,
  getGolferStats,
  clearPayouts,
  insertPayout,
} from './db/queries';

export { LiveUpdates } from './durable-objects/live-updates';

type HonoEnv = { Bindings: Env };

const app = new Hono<HonoEnv>();

// Mount API routes
app.route('/', api);

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

export default {
  // HTTP request handler
  fetch: app.fetch,

  // Cron trigger — runs every 8 minutes to ingest fresh golf data
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`[CRON] Data ingestion triggered at ${new Date().toISOString()}`);
    try {
      const result = await ingestGolfData(env);
      console.log(`[CRON] Ingestion complete: ${result.count} golfers updated`);
    } catch (err) {
      console.error(`[CRON] Ingestion failed: ${err}`);
    }
  },

  // Queue consumer — processes payout calculations
  async queue(batch: MessageBatch<PayoutQueueMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      if (message.body.type === 'RECALCULATE_PAYOUTS') {
        const tournamentId = message.body.tournament_id;
        console.log(`[QUEUE] Recalculating payouts for tournament ${tournamentId}`);

        try {
          const tournament = await getActiveTournament(env.DB);
          if (!tournament) {
            console.error(`[QUEUE] Tournament ${tournamentId} not found`);
            message.ack();
            continue;
          }

          const [golfers, purchases, stats] = await Promise.all([
            getGolferScores(env.DB, tournamentId),
            getPurchases(env.DB, tournamentId),
            getGolferStats(env.DB, tournamentId),
          ]);

          const result = calculatePayouts(tournament, golfers, purchases, stats);

          // Clear old projected payouts and insert new ones
          await clearPayouts(env.DB, tournamentId);
          for (const entry of result.entries) {
            await insertPayout(
              env.DB,
              tournamentId,
              entry.participant_name,
              entry.payout_type,
              entry.amount,
              entry.golfer_name,
              entry.description,
              false
            );
          }

          // Broadcast update to all connected WebSocket clients
          try {
            const id = env.LIVE_UPDATES.idFromName('global');
            const stub = env.LIVE_UPDATES.get(id);
            await stub.fetch(new Request('https://internal/broadcast', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ summary: result.summary, timestamp: Date.now() }),
            }));
          } catch (err) {
            console.error(`[QUEUE] WebSocket broadcast failed: ${err}`);
          }

          console.log(`[QUEUE] Payouts calculated: ${result.entries.length} entries for ${result.summary.length} participants`);
          message.ack();
        } catch (err) {
          console.error(`[QUEUE] Payout calculation failed: ${err}`);
          message.retry();
        }
      }
    }
  },
};
