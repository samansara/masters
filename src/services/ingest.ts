import type { Env, Tournament, GolferScore } from '../types';
import {
  getActiveTournament,
  upsertGolferScore,
  upsertGolferStats,
  getGolferScores,
  getGolferScoreByName,
  updateProjectedCutsByScore,
  updateProjectedCutsByPosition,
  updateTournamentRoundStatus,
} from '../db/queries';
import { fetchESPNLeaderboard, fetchMastersLeaderboard, fetchESPNPlayerStats } from './golf-data';
import { fetchMastersStats } from './masters-stats';
import type { RawGolferData, ESPNRoundStatus } from './golf-data';

export async function ingestGolfData(env: Env): Promise<{ success: boolean; count: number; statsCount?: number; error?: string }> {
  const tournament = await getActiveTournament(env.DB);
  if (!tournament) {
    return { success: false, count: 0, error: 'No active tournament found' };
  }

  let golfers: RawGolferData[] = [];
  let espnEventId: string | null = null;
  let espnCutScore: number | null = null;
  let espnCutCount: number | null = null;
  let roundStatus: ESPNRoundStatus | null = null;

  // Try ESPN first, then Masters.com as fallback
  try {
    const espnResult = await fetchESPNLeaderboard();
    golfers = espnResult.golfers;
    espnEventId = espnResult.eventId;
    espnCutScore = espnResult.cutScore;
    espnCutCount = espnResult.cutCount;
    roundStatus = espnResult.roundStatus;
    if (golfers.length === 0) throw new Error('ESPN returned empty data');
  } catch (espnError) {
    console.log(`ESPN fetch failed: ${espnError}, trying Masters.com...`);
    try {
      golfers = await fetchMastersLeaderboard(tournament.year);
    } catch (mastersError) {
      return {
        success: false,
        count: 0,
        error: `Both data sources failed. ESPN: ${espnError}. Masters: ${mastersError}`,
      };
    }
  }

  // Store ESPN round status in the tournament table so payouts.ts can use it
  const currentRound = roundStatus?.round ?? null;
  const roundState = roundStatus?.state ?? null;
  const roundDetail = roundStatus?.detail ?? null;
  try {
    await updateTournamentRoundStatus(
      env.DB, tournament.id,
      currentRound, roundState, roundDetail,
      espnCutScore, espnCutCount
    );
  } catch (err) {
    console.error(`[INGEST] Failed to update round status: ${err}`);
  }

  // Upsert all golfer scores
  let count = 0;
  for (const golfer of golfers) {
    try {
      await upsertGolferScore(env.DB, tournament.id, golfer);
      count++;
    } catch (err) {
      console.error(`Failed to upsert golfer ${golfer.name}: ${err}`);
    }
  }

  // Determine round progress from ESPN API
  // period: 1=R1, 2=R2, 3=R3, 4=R4
  // state: 'pre' (not started), 'in' (in progress), 'post' (complete)
  const cutRound = 2; // Cut happens after R2
  // R2 is done when: round > 2, OR round == 2 and state == 'post'
  const r2Done = currentRound !== null && (currentRound > cutRound || (currentRound === cutRound && roundState === 'post'));

  console.log(`[INGEST] Round status: R${currentRound} ${roundState} (${roundDetail || 'unknown'}) | r2Done=${r2Done} | cutScore=${espnCutScore} cutCount=${espnCutCount}`);

  // Update projected cut status
  // Cut is projected during R1 and R2. Locked in once R2 is complete (ESPN provides made_cut).
  try {
    const currentScores = await getGolferScores(env.DB, tournament.id);
    const active = currentScores.filter((g) => g.status !== 'WD' && g.status !== 'DQ');

    if (!r2Done && currentScores.length > 0) {
      if (espnCutScore !== null) {
        // Primary: ESPN provides cutScore — to_par <= cutScore makes the projected cut
        await updateProjectedCutsByScore(env.DB, tournament.id, espnCutScore);
        const projectedCount = active.filter((g) => g.to_par !== null && g.to_par <= espnCutScore).length;
        console.log(`[INGEST] Projected cut via ESPN: to_par <= ${espnCutScore} → ${projectedCount} players (ESPN cutCount=${espnCutCount})`);
      } else {
        // Fallback: position <= cut_line (same logic as Saturday/Sunday position payouts)
        await updateProjectedCutsByPosition(env.DB, tournament.id, tournament.cut_line);
        console.log(`[INGEST] Projected cut via position fallback: position <= ${tournament.cut_line}`);
      }
    } else if (r2Done) {
      console.log(`[INGEST] R2 complete — cut locked in via ESPN made_cut`);
    }
  } catch (err) {
    console.error(`[INGEST] Failed to update projected cuts: ${err}`);
  }

  // Fetch stats: ESPN players endpoint (primary), Masters.com (fallback)
  let statsCount = 0;
  try {
    if (espnEventId) {
      // Primary: ESPN player stats
      const espnStats = await fetchESPNPlayerStats(espnEventId);
      for (const ps of espnStats) {
        const golferScore = await getGolferScoreByName(env.DB, tournament.id, ps.name);
        if (golferScore) {
          await upsertGolferStats(env.DB, tournament.id, golferScore.id, {
            driving_accuracy: ps.driving_accuracy,
            putts_per_round: ps.putts_per_gir,
            gir_pct: ps.gir_pct,
          });
          statsCount++;
        }
      }
      console.log(`[INGEST] ESPN stats updated for ${statsCount} golfers`);
    } else {
      // Fallback: Masters.com stats
      const playerStats = await fetchMastersStats(tournament.year);
      for (const ps of playerStats) {
        const golferScore = await getGolferScoreByName(env.DB, tournament.id, ps.name);
        if (golferScore) {
          await upsertGolferStats(env.DB, tournament.id, golferScore.id, {
            driving_accuracy: ps.driving_accuracy,
            putts_per_round: ps.putts_per_round,
            gir_pct: ps.gir_pct,
          });
          statsCount++;
        }
      }
      console.log(`[INGEST] Masters.com stats updated for ${statsCount} golfers`);
    }
  } catch (err) {
    console.error(`[INGEST] Failed to fetch/store stats: ${err}`);
  }

  // Queue payout recalculation
  try {
    await env.PAYOUT_QUEUE.send({
      type: 'RECALCULATE_PAYOUTS',
      tournament_id: tournament.id,
    });
  } catch (err) {
    console.error(`Failed to queue payout calculation: ${err}`);
  }

  return { success: true, count, statsCount };
}
