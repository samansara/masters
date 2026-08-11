import type { Tournament, AuctionPurchase, GolferScore, GolferStats, Payout } from '../types';

export async function getActiveTournament(db: D1Database): Promise<Tournament | null> {
  const result = await db.prepare(
    `SELECT * FROM tournaments WHERE status = 'active' ORDER BY year DESC LIMIT 1`
  ).first<Tournament>();
  return result ?? null;
}

export async function getTournament(db: D1Database, id: number): Promise<Tournament | null> {
  return await db.prepare(`SELECT * FROM tournaments WHERE id = ?`).bind(id).first<Tournament>() ?? null;
}

export async function createTournament(
  db: D1Database,
  year: number,
  total_pot: number,
  name?: string,
  cut_line?: number
): Promise<Tournament> {
  // Auto-complete any existing active tournaments
  await db.prepare(
    `UPDATE tournaments SET status = 'completed' WHERE status = 'active'`
  ).run();
  const result = await db.prepare(
    `INSERT INTO tournaments (year, name, total_pot, cut_line, status) VALUES (?, ?, ?, ?, 'active') RETURNING *`
  ).bind(year, name ?? 'The Masters', total_pot, cut_line ?? 50).first<Tournament>();
  return result!;
}

export async function updateTournamentStatus(
  db: D1Database,
  id: number,
  status: string
): Promise<void> {
  await db.prepare(`UPDATE tournaments SET status = ? WHERE id = ?`).bind(status, id).run();
}

export async function updateTournamentRoundStatus(
  db: D1Database,
  id: number,
  currentRound: number | null,
  roundState: string | null,
  roundDetail: string | null,
  espnCutScore: number | null,
  espnCutCount: number | null
): Promise<void> {
  await db.prepare(`
    UPDATE tournaments SET current_round = ?, round_state = ?, round_detail = ?, espn_cut_score = ?, espn_cut_count = ?
    WHERE id = ?
  `).bind(currentRound, roundState, roundDetail, espnCutScore, espnCutCount, id).run();
}

export async function getPurchases(db: D1Database, tournamentId: number): Promise<AuctionPurchase[]> {
  const result = await db.prepare(
    `SELECT * FROM auction_purchases WHERE tournament_id = ? ORDER BY participant_name, golfer_name`
  ).bind(tournamentId).all<AuctionPurchase>();
  return result.results;
}

export async function insertPurchases(
  db: D1Database,
  tournamentId: number,
  purchases: { participant: string; golfer: string; price: number }[]
): Promise<void> {
  await db.prepare(`DELETE FROM auction_purchases WHERE tournament_id = ?`).bind(tournamentId).run();

  const stmt = db.prepare(
    `INSERT INTO auction_purchases (tournament_id, participant_name, golfer_name, purchase_price) VALUES (?, ?, ?, ?)`
  );
  const batch = purchases.map((p) =>
    stmt.bind(tournamentId, p.participant.trim(), p.golfer.trim(), p.price)
  );

  const BATCH_SIZE = 50;
  for (let i = 0; i < batch.length; i += BATCH_SIZE) {
    await db.batch(batch.slice(i, i + BATCH_SIZE));
  }
}

export async function getGolferScores(db: D1Database, tournamentId: number): Promise<GolferScore[]> {
  const result = await db.prepare(
    `SELECT * FROM golfer_scores WHERE tournament_id = ? ORDER BY 
      CASE WHEN to_par IS NULL THEN 1 ELSE 0 END,
      to_par ASC,
      total_score ASC`
  ).bind(tournamentId).all<GolferScore>();
  return result.results;
}

export async function upsertGolferScore(
  db: D1Database,
  tournamentId: number,
  golfer: {
    player_id: string;
    name: string;
    is_amateur: boolean;
    r1_score: number | null;
    r2_score: number | null;
    r3_score: number | null;
    r4_score: number | null;
    total_score: number | null;
    to_par: number | null;
    position: string | null;
    made_cut: boolean | null;
    thru: string | null;
    status: string;
  }
): Promise<void> {
  await db.prepare(`
    INSERT INTO golfer_scores (tournament_id, player_id, name, is_amateur, r1_score, r2_score, r3_score, r4_score, total_score, to_par, position, made_cut, thru, status, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(tournament_id, player_id) DO UPDATE SET
      name = excluded.name,
      is_amateur = excluded.is_amateur,
      r1_score = excluded.r1_score,
      r2_score = excluded.r2_score,
      r3_score = excluded.r3_score,
      r4_score = excluded.r4_score,
      total_score = excluded.total_score,
      to_par = excluded.to_par,
      position = excluded.position,
      made_cut = excluded.made_cut,
      thru = excluded.thru,
      status = excluded.status,
      updated_at = datetime('now')
  `).bind(
    tournamentId,
    golfer.player_id,
    golfer.name,
    golfer.is_amateur ? 1 : 0,
    golfer.r1_score,
    golfer.r2_score,
    golfer.r3_score,
    golfer.r4_score,
    golfer.total_score,
    golfer.to_par,
    golfer.position,
    golfer.made_cut === null ? null : golfer.made_cut ? 1 : 0,
    golfer.thru,
    golfer.status
  ).run();
}

export async function upsertGolferStats(
  db: D1Database,
  tournamentId: number,
  golferScoreId: number,
  stats: { driving_accuracy: number | null; putts_per_round: number | null; gir_pct: number | null }
): Promise<void> {
  await db.prepare(`
    INSERT INTO golfer_stats (tournament_id, golfer_score_id, driving_accuracy, putts_per_round, gir_pct, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(tournament_id, golfer_score_id) DO UPDATE SET
      driving_accuracy = excluded.driving_accuracy,
      putts_per_round = excluded.putts_per_round,
      gir_pct = excluded.gir_pct,
      updated_at = datetime('now')
  `).bind(tournamentId, golferScoreId, stats.driving_accuracy, stats.putts_per_round, stats.gir_pct).run();
}

export async function getGolferStats(db: D1Database, tournamentId: number): Promise<(GolferStats & { golfer_name: string; made_cut: number | null })[]> {
  const result = await db.prepare(`
    SELECT gs.*, s.name as golfer_name, s.made_cut, s.projected_cut
    FROM golfer_stats gs
    JOIN golfer_scores s ON gs.golfer_score_id = s.id
    WHERE gs.tournament_id = ?
  `).bind(tournamentId).all<GolferStats & { golfer_name: string; made_cut: number | null }>();
  return result.results;
}

export async function getGolferScoreByName(db: D1Database, tournamentId: number, name: string): Promise<GolferScore | null> {
  return await db.prepare(
    `SELECT * FROM golfer_scores WHERE tournament_id = ? AND LOWER(name) = LOWER(?) LIMIT 1`
  ).bind(tournamentId, name).first<GolferScore>() ?? null;
}

export async function updateProjectedCutsByScore(db: D1Database, tournamentId: number, cutScore: number): Promise<void> {
  // ESPN cutScore: to_par <= cutScore means projected to make the cut
  // Exclude WD/DQ players
  await db.prepare(`
    UPDATE golfer_scores SET projected_cut = CASE
      WHEN status IN ('WD', 'DQ') THEN NULL
      WHEN to_par IS NOT NULL AND to_par <= ? THEN 1
      WHEN to_par IS NOT NULL THEN 0
      ELSE NULL
    END
    WHERE tournament_id = ? AND made_cut IS NULL
  `).bind(cutScore, tournamentId).run();
}

export async function updateProjectedCutsByPosition(db: D1Database, tournamentId: number, cutLine: number): Promise<void> {
  // Fallback: position <= cutLine (mirrors Saturday/Sunday position payout logic)
  // Exclude WD/DQ, empty/null positions, and positions that parse to 0 (invalid)
  await db.prepare(`
    UPDATE golfer_scores SET projected_cut = CASE
      WHEN status IN ('WD', 'DQ') THEN NULL
      WHEN position IS NOT NULL AND position != ''
           AND CAST(REPLACE(position, 'T', '') AS INTEGER) > 0
           AND CAST(REPLACE(position, 'T', '') AS INTEGER) <= ? THEN 1
      WHEN position IS NOT NULL AND position != ''
           AND CAST(REPLACE(position, 'T', '') AS INTEGER) > 0 THEN 0
      ELSE NULL
    END
    WHERE tournament_id = ? AND made_cut IS NULL
  `).bind(cutLine, tournamentId).run();
}

export async function clearPayouts(db: D1Database, tournamentId: number): Promise<void> {
  await db.prepare(`DELETE FROM payouts WHERE tournament_id = ? AND is_final = 0`).bind(tournamentId).run();
}

export async function insertPayout(
  db: D1Database,
  tournamentId: number,
  participant: string,
  type: string,
  amount: number,
  golferName: string | null,
  description: string | null,
  isFinal: boolean
): Promise<void> {
  await db.prepare(`
    INSERT INTO payouts (tournament_id, participant_name, payout_type, amount, golfer_name, description, is_final, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(tournamentId, participant, type, amount, golferName, description, isFinal ? 1 : 0).run();
}

export async function getPayouts(db: D1Database, tournamentId: number): Promise<Payout[]> {
  const result = await db.prepare(
    `SELECT * FROM payouts WHERE tournament_id = ? ORDER BY participant_name, payout_type`
  ).bind(tournamentId).all<Payout>();
  return result.results;
}

export async function getParticipantNames(db: D1Database, tournamentId: number): Promise<string[]> {
  const result = await db.prepare(
    `SELECT DISTINCT participant_name FROM auction_purchases WHERE tournament_id = ? ORDER BY participant_name`
  ).bind(tournamentId).all<{ participant_name: string }>();
  return result.results.map((r) => r.participant_name);
}
