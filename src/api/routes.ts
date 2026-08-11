import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from '../types';
import {
  getActiveTournament,
  getTournament,
  createTournament,
  updateTournamentStatus,
  getPurchases,
  insertPurchases,
  getGolferScores,
  getPayouts,
  getParticipantNames,
  getGolferStats,
} from '../db/queries';
import { calculatePayouts } from '../services/payouts';
import { fetchESPNTournamentName } from '../services/golf-data';

function normalizeName(n: string): string {
  return n.toLowerCase().replace(/\s*\(a\)\s*$/, '').trim();
}

type HonoEnv = { Bindings: Env };

const api = new Hono<HonoEnv>().basePath('/api');

api.use('*', cors({
  origin: (origin) => {
    if (!origin) return undefined;
    if (origin === 'https://masters.samlikessports.com') return origin;
    if (/^https:\/\/masters-auction\.[^.]+\.workers\.dev$/.test(origin)) return origin;
    return undefined;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));

// GET /api/tournament — Get active tournament info
api.get('/tournament', async (c) => {
  const tournament = await getActiveTournament(c.env.DB);
  if (!tournament) return c.json({ error: 'No active tournament' }, 404);
  return c.json(tournament);
});

// POST /api/admin/tournament — Create a new tournament
api.post('/admin/tournament', async (c) => {
  const body = await c.req.json<{ year: number; total_pot: number; name?: string; cut_line?: number }>();
  if (!body.year || !body.total_pot) {
    return c.json({ error: 'year and total_pot are required' }, 400);
  }
  // Fetch tournament name from ESPN if not provided
  let name = body.name;
  if (!name) {
    name = await fetchESPNTournamentName() ?? 'PGA Tournament';
  }
  const tournament = await createTournament(c.env.DB, body.year, body.total_pot, name, body.cut_line);
  return c.json(tournament, 201);
});

// PUT /api/admin/tournament/:id/status — Update tournament status
api.put('/admin/tournament/:id/status', async (c) => {
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json<{ status: string }>();
  const allowed = ['upcoming', 'active', 'completed'];
  if (!allowed.includes(body.status)) {
    return c.json({ error: `Invalid status. Must be one of: ${allowed.join(', ')}` }, 400);
  }
  await updateTournamentStatus(c.env.DB, id, body.status);
  return c.json({ success: true });
});

// POST /api/admin/upload-auction — Upload auction CSV data
api.post('/admin/upload-auction', async (c) => {
  const contentType = c.req.header('content-type') || '';
  let purchases: { participant: string; golfer: string; price: number }[] = [];

  if (contentType.includes('application/json')) {
    const body = await c.req.json<{
      tournament_id: number;
      purchases: { participant: string; golfer: string; price: number }[];
    }>();
    const tournament = await getTournament(c.env.DB, body.tournament_id);
    if (!tournament) return c.json({ error: 'Tournament not found' }, 404);
    purchases = body.purchases;
    await insertPurchases(c.env.DB, body.tournament_id, purchases);
    return c.json({ success: true, count: purchases.length });
  }

  // Handle CSV text body
  if (contentType.includes('text/csv') || contentType.includes('text/plain')) {
    const tournamentIdStr = c.req.query('tournament_id');
    if (!tournamentIdStr) return c.json({ error: 'tournament_id query param required' }, 400);
    const tournamentId = parseInt(tournamentIdStr);
    const tournament = await getTournament(c.env.DB, tournamentId);
    if (!tournament) return c.json({ error: 'Tournament not found' }, 404);

    const text = await c.req.text();
    const lines = text.trim().split('\n');
    const startIdx = lines[0].toLowerCase().includes('participant') ? 1 : 0;

    for (let i = startIdx; i < lines.length; i++) {
      const parts = lines[i].split(',').map((s) => s.trim());
      if (parts.length >= 3) {
        purchases.push({
          participant: parts[0],
          golfer: parts[1],
          price: parseFloat(parts[2]),
        });
      }
    }

    await insertPurchases(c.env.DB, tournamentId, purchases);
    return c.json({ success: true, count: purchases.length });
  }

  return c.json({ error: 'Unsupported content type. Use application/json or text/csv' }, 400);
});

// GET /api/leaderboard — Current golf leaderboard with ownership info
api.get('/leaderboard', async (c) => {
  const tournament = await getActiveTournament(c.env.DB);
  if (!tournament) return c.json({ error: 'No active tournament' }, 404);

  const [golfers, purchases] = await Promise.all([
    getGolferScores(c.env.DB, tournament.id),
    getPurchases(c.env.DB, tournament.id),
  ]);

  const ownerMap = new Map(purchases.map((p) => [normalizeName(p.golfer_name), p.participant_name]));

  const leaderboard = golfers.map((g) => ({
    position: g.position,
    name: g.name,
    to_par: g.to_par,
    thru: g.thru,
    r1: g.r1_score,
    r2: g.r2_score,
    r3: g.r3_score,
    r4: g.r4_score,
    total: g.total_score,
    is_amateur: g.is_amateur === 1,
    made_cut: g.made_cut === null ? null : g.made_cut === 1,
    projected_cut: g.projected_cut === null ? null : g.projected_cut === 1,
    status: g.status,
    owner: ownerMap.get(normalizeName(g.name)) || null,
  }));

  // Cut line info for UI display
  const r2Done = tournament.current_round !== null &&
    (tournament.current_round > 2 || (tournament.current_round === 2 && tournament.round_state === 'post'));
  const cutInfo = {
    cut_line: tournament.cut_line,
    espn_cut_score: tournament.espn_cut_score,
    espn_cut_count: tournament.espn_cut_count,
    is_final: r2Done,
    current_round: tournament.current_round,
    round_state: tournament.round_state,
  };

  return c.json({
    tournament: { id: tournament.id, year: tournament.year, name: tournament.name, status: tournament.status },
    leaderboard,
    cut_info: cutInfo,
    last_updated: golfers[0]?.updated_at || null,
  });
});

// GET /api/payouts — Current payout calculations
api.get('/payouts', async (c) => {
  const tournament = await getActiveTournament(c.env.DB);
  if (!tournament) return c.json({ error: 'No active tournament' }, 404);

  const [golfers, purchases, stats] = await Promise.all([
    getGolferScores(c.env.DB, tournament.id),
    getPurchases(c.env.DB, tournament.id),
    getGolferStats(c.env.DB, tournament.id),
  ]);

  const result = calculatePayouts(tournament, golfers, purchases, stats);
  return c.json(result);
});

// GET /api/participants — All participants with their golfers and payouts
api.get('/participants', async (c) => {
  const tournament = await getActiveTournament(c.env.DB);
  if (!tournament) return c.json({ error: 'No active tournament' }, 404);

  const [golfers, purchases, stats] = await Promise.all([
    getGolferScores(c.env.DB, tournament.id),
    getPurchases(c.env.DB, tournament.id),
    getGolferStats(c.env.DB, tournament.id),
  ]);

  const payoutResult = calculatePayouts(tournament, golfers, purchases, stats);
  const golferMap = new Map(golfers.map((g) => [normalizeName(g.name), g]));

  const participants = new Map<string, {
    name: string;
    total_spent: number;
    total_winnings: number;
    net: number;
    golfers: any[];
    payouts: any[];
  }>();

  // Build per-golfer payouts lookup: participant+golfer -> payout entries
  const golferPayoutsMap = new Map<string, { type: string; amount: number }[]>();
  const golferWinningsMap = new Map<string, number>();
  for (const entry of payoutResult.entries) {
    if (entry.golfer_name) {
      const gKey = normalizeName(entry.golfer_name);
      golferWinningsMap.set(gKey, (golferWinningsMap.get(gKey) || 0) + entry.amount);

      const pKey = `${entry.participant_name}|||${gKey}`;
      if (!golferPayoutsMap.has(pKey)) golferPayoutsMap.set(pKey, []);
      golferPayoutsMap.get(pKey)!.push({
        type: entry.payout_type,
        amount: Math.round(entry.amount * 100) / 100,
      });
    }
  }

  // Build participant data with payouts nested under each golfer
  for (const p of purchases) {
    if (!participants.has(p.participant_name)) {
      participants.set(p.participant_name, {
        name: p.participant_name,
        total_spent: 0,
        total_winnings: 0,
        net: 0,
        golfers: [],
        payouts: [],
      });
    }
    const participant = participants.get(p.participant_name)!;
    participant.total_spent += p.purchase_price;

    const golfer = golferMap.get(normalizeName(p.golfer_name));
    const golferWon = Math.round((golferWinningsMap.get(normalizeName(p.golfer_name)) || 0) * 100) / 100;
    const pKey = `${p.participant_name}|||${normalizeName(p.golfer_name)}`;
    participant.golfers.push({
      name: p.golfer_name,
      price: p.purchase_price,
      won: golferWon,
      net: Math.round((golferWon - p.purchase_price) * 100) / 100,
      position: golfer?.position ?? null,
      to_par: golfer?.to_par ?? null,
      made_cut: golfer?.made_cut === null ? null : golfer?.made_cut === 1,
      thru: golfer?.thru ?? null,
      status: golfer?.status ?? 'unknown',
      payouts: golferPayoutsMap.get(pKey) || [],
    });
  }

  // Accumulate total winnings
  for (const entry of payoutResult.entries) {
    const participant = participants.get(entry.participant_name);
    if (participant) {
      participant.total_winnings += entry.amount;
    }
  }

  // Calculate net and sort golfers by net descending
  for (const [, p] of participants) {
    p.total_winnings = Math.round(p.total_winnings * 100) / 100;
    p.net = Math.round((p.total_winnings - p.total_spent) * 100) / 100;
    p.golfers.sort((a: any, b: any) => b.net - a.net);
  }

  const sorted = [...participants.values()].sort((a, b) => b.net - a.net);
  return c.json({
    tournament: { id: tournament.id, year: tournament.year, total_pot: tournament.total_pot, status: tournament.status },
    participants: sorted,
    last_updated: golfers[0]?.updated_at || null,
  });
});

// POST /api/admin/upload-historical — Upload historical results CSV
api.post('/admin/upload-historical', async (c) => {
  const body = await c.req.json<{ year: number; rows: any[] }>();
  if (!body.year || !body.rows || body.rows.length === 0) {
    return c.json({ error: 'year and rows are required' }, 400);
  }
  if (body.rows.length > 500) {
    return c.json({ error: 'Too many rows. Max 500 per upload.' }, 400);
  }

  // Clear existing data for this year
  await c.env.DB.prepare('DELETE FROM historical_results WHERE year = ?').bind(body.year).run();

  const stmt = c.env.DB.prepare(
    `INSERT INTO historical_results (year, player, bidder, price, cut, low_am, high_score, stats, sat, sun, payout, net)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const parseMoney = (v: any): number => {
    if (typeof v === 'number') return v;
    const s = String(v || '').replace(/[$,\s]/g, '');
    // Handle parentheses as negative: ($50) -> -50
    const neg = s.startsWith('(') && s.endsWith(')');
    const cleaned = neg ? s.slice(1, -1) : s;
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : (neg ? -num : num);
  };

  const batch = body.rows.map((r: any) =>
    stmt.bind(
      body.year,
      (r.player || '').trim(),
      (r.bidder || '').trim(),
      parseMoney(r.price),
      parseMoney(r.cut),
      parseMoney(r.low_am),
      parseMoney(r.high_score),
      parseMoney(r.stats),
      parseMoney(r.sat),
      parseMoney(r.sun),
      parseMoney(r.payout),
      parseMoney(r.net)
    )
  );

  const BATCH_SIZE = 50;
  for (let i = 0; i < batch.length; i += BATCH_SIZE) {
    await c.env.DB.batch(batch.slice(i, i + BATCH_SIZE));
  }

  return c.json({ success: true, year: body.year, count: body.rows.length });
});

// GET /api/historical/years — List available historical years
api.get('/historical/years', async (c) => {
  const result = await c.env.DB.prepare(
    'SELECT DISTINCT year FROM historical_results ORDER BY year DESC'
  ).all<{ year: number }>();
  return c.json({ years: result.results.map((r) => r.year) });
});

// GET /api/historical/all-time — All-time participant summary across all years
api.get('/historical/all-time', async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT bidder,
           COUNT(DISTINCT year) as auctions,
           SUM(price) as total_spent,
           SUM(payout) as total_payout,
           SUM(net) as total_net
    FROM historical_results
    GROUP BY bidder
    ORDER BY total_net DESC
  `).all();

  const participants = (result.results as any[]).map((r) => ({
    name: r.bidder,
    auctions: r.auctions,
    total_spent: Math.round(r.total_spent * 100) / 100,
    total_payout: Math.round(r.total_payout * 100) / 100,
    net: Math.round(r.total_net * 100) / 100,
  }));

  return c.json({ participants });
});

// GET /api/historical/:year — Get historical results for a year
api.get('/historical/:year', async (c) => {
  const year = parseInt(c.req.param('year'));
  const result = await c.env.DB.prepare(
    'SELECT * FROM historical_results WHERE year = ? ORDER BY net DESC'
  ).bind(year).all();

  if (result.results.length === 0) {
    return c.json({ error: 'No data for this year' }, 404);
  }

  // Build participant summary
  const participantMap = new Map<string, { spent: number; payout: number; net: number; golfers: any[] }>();
  for (const row of result.results as any[]) {
    if (!participantMap.has(row.bidder)) {
      participantMap.set(row.bidder, { spent: 0, payout: 0, net: 0, golfers: [] });
    }
    const p = participantMap.get(row.bidder)!;
    p.spent += row.price;
    p.payout += row.payout;
    p.net += row.net;
    p.golfers.push(row);
  }

  const participants = [...participantMap.entries()]
    .map(([name, data]) => ({
      name,
      total_spent: Math.round(data.spent * 100) / 100,
      total_payout: Math.round(data.payout * 100) / 100,
      net: Math.round(data.net * 100) / 100,
      golfers: data.golfers,
    }))
    .sort((a, b) => b.net - a.net);

  return c.json({ year, participants, total_rows: result.results.length });
});

// POST /api/admin/trigger-ingest — Manually trigger data ingestion
api.post('/admin/trigger-ingest', async (c) => {
  const { ingestGolfData } = await import('../services/ingest');
  const result = await ingestGolfData(c.env);
  return c.json(result);
});

// WebSocket upgrade endpoint
api.get('/ws', async (c) => {
  const id = c.env.LIVE_UPDATES.idFromName('global');
  const stub = c.env.LIVE_UPDATES.get(id);
  return stub.fetch(c.req.raw);
});

export { api };
