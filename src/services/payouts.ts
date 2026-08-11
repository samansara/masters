import type { GolferScore, GolferStats, AuctionPurchase, Tournament } from '../types';
import { SATURDAY_PAYOUTS, SUNDAY_PAYOUTS, PAYOUT_PERCENTAGES } from '../types';

export interface PayoutEntry {
  participant_name: string;
  payout_type: string;
  amount: number;
  golfer_name: string | null;
  description: string;
}

export interface PayoutResult {
  entries: PayoutEntry[];
  summary: {
    participant_name: string;
    total_spent: number;
    total_winnings: number;
    net: number;
  }[];
  tournament_status: string;
}

function normalizeName(n: string): string {
  return n.toLowerCase().replace(/\s*\(a\)\s*$/, '').trim();
}

function parsePosition(pos: string | null): number {
  if (!pos) return 999;
  const cleaned = pos.replace(/^T/, '');
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? 999 : num;
}

function isTied(pos: string | null): boolean {
  if (!pos) return false;
  return pos.startsWith('T');
}

function countPlayersAtOrAbovePosition(golfers: GolferScore[], targetPos: number): number {
  let count = 0;
  for (const g of golfers) {
    const pos = parsePosition(g.position);
    if (pos <= targetPos) count++;
  }
  return count;
}

function findGolfersAtPosition(golfers: GolferScore[], targetPos: number): GolferScore[] {
  return golfers.filter((g) => parsePosition(g.position) === targetPos);
}

function awardPayoutToGolferOwner(
  entries: PayoutEntry[],
  purchases: AuctionPurchase[],
  golferName: string,
  amount: number,
  type: string,
  description: string
): void {
  const owner = purchases.find(
    (p) => normalizeName(p.golfer_name) === normalizeName(golferName)
  );
  if (owner) {
    entries.push({
      participant_name: owner.participant_name,
      payout_type: type,
      amount,
      golfer_name: golferName,
      description,
    });
  }
}

/**
 * Determine effective cut status for a golfer.
 * After R2: ESPN provides made_cut directly (locked in).
 * During R1/R2: uses projected_cut set during ingestion (position <= tournament.cut_line).
 */
function getEffectiveCutStatus(golfer: GolferScore): boolean | null {
  // If the data source already told us, use that (locked in after R2)
  if (golfer.made_cut === 1) return true;
  if (golfer.made_cut === 0) return false;
  // Use projected_cut if available (set during ingestion: position <= cut_line)
  if (golfer.projected_cut === 1) return true;
  if (golfer.projected_cut === 0) return false;
  // No data yet
  return null;
}

export function calculatePayouts(
  tournament: Tournament,
  golfers: GolferScore[],
  purchases: AuctionPurchase[],
  stats: (GolferStats & { golfer_name: string; made_cut?: number | null })[]
): PayoutResult {
  const entries: PayoutEntry[] = [];
  const pot = tournament.total_pot;
  const activeGolfers = golfers.filter((g) => g.status !== 'WD' && g.status !== 'DQ');
  const golfersWithPos = activeGolfers.filter((g) => g.position !== null);

  // Determine tournament progress from ESPN round status (stored during ingestion)
  // current_round: 1-4, round_state: 'pre' | 'in' | 'post'
  const currentRound = tournament.current_round ?? 0;
  const roundState = tournament.round_state ?? 'pre';

  // Round completion checks using ESPN authoritative status
  const r2Complete = currentRound > 2 || (currentRound === 2 && roundState === 'post');
  const r3Complete = ((_golfers: GolferScore[]) =>
    currentRound > 3 || (currentRound === 3 && roundState === 'post')
  );
  const r4Complete = ((_golfers: GolferScore[]) =>
    currentRound > 4 || (currentRound === 4 && roundState === 'post')
  );

  // Effective cut status: actual after R2, projected before
  const cutMakers = activeGolfers.filter((g) => getEffectiveCutStatus(g) === true);
  const cutIsProjected = !r2Complete;

  // For projected payouts, use current positions as the basis for all position-based awards
  // As the tournament progresses, these naturally converge to actual results

  // 1. Making the Cut — 25% split among all players that make (or project to make) the cut
  if (cutMakers.length > 0) {
    const cutPayoutPerGolfer = (pot * PAYOUT_PERCENTAGES.MAKING_CUT) / cutMakers.length;
    const label = cutIsProjected ? 'Making the Cut (Projected)' : 'Making the Cut';
    for (const golfer of cutMakers) {
      awardPayoutToGolferOwner(
        entries,
        purchases,
        golfer.name,
        cutPayoutPerGolfer,
        label,
        `${golfer.name} ${cutIsProjected ? 'projected to make' : 'made'} the cut (1/${cutMakers.length} share of 25%)`
      );
    }
  }

  // 2. Low Amateur — 1.2% to the lowest scoring amateur
  // Rules:
  //   - Before cut: projected from all amateurs
  //   - All ams miss cut: locked in (lowest am at time of cut)
  //   - Exactly 1 am makes cut: locked in (they win by default)
  //   - 2+ ams make cut: projected until R4 complete
  const amateurs = activeGolfers.filter(
    (g) => g.is_amateur === 1 && g.to_par !== null
  );
  if (amateurs.length > 0) {
    const amateurCutMakers = cutMakers.filter((g) => g.is_amateur === 1);

    let isFinal = false;
    let lowAmPool = amateurs;

    if (r2Complete) {
      if (amateurCutMakers.length === 0) {
        // All ams missed the cut — locked in
        isFinal = true;
      } else if (amateurCutMakers.length === 1) {
        // Only 1 am made the cut — locked in
        isFinal = true;
        lowAmPool = amateurCutMakers;
      } else {
        // 2+ ams made the cut — wait for R4
        isFinal = r4Complete(amateurCutMakers);
        lowAmPool = amateurCutMakers;
      }
    }

    const sorted = [...lowAmPool].sort((a, b) => (a.to_par ?? 999) - (b.to_par ?? 999));
    const lowestPar = sorted[0].to_par;
    const tiedLowAm = sorted.filter((g) => g.to_par === lowestPar);
    const perGolfer = (pot * PAYOUT_PERCENTAGES.LOW_AM) / tiedLowAm.length;
    const tag = isFinal ? '' : ' (Projected)';
    for (const golfer of tiedLowAm) {
      const tieLabel = tiedLowAm.length > 1 ? ` (${tiedLowAm.length}-way tie)` : '';
      awardPayoutToGolferOwner(
        entries,
        purchases,
        golfer.name,
        perGolfer,
        `Low Amateur${tag}`,
        `${golfer.name} — Low Amateur (${golfer.to_par! >= 0 ? '+' : ''}${golfer.to_par})${tieLabel}`
      );
    }
  }

  // 3. Pre-Cut High Total — 1.6% to highest total score in R1+R2 among non-cut-makers
  // Before cut: project from current scores of players outside projected cut line
  // After cut: use actual missed-cut players' R1+R2 totals
  if (r2Complete) {
    // Actual: use confirmed missed-cut players
    const nonCutters = activeGolfers.filter(
      (g) => g.made_cut === 0 && g.r1_score !== null && g.r2_score !== null
    );
    if (nonCutters.length > 0) {
      const withTotals = nonCutters.map((g) => ({
        ...g,
        preCutTotal: (g.r1_score ?? 0) + (g.r2_score ?? 0),
      }));
      const maxTotal = Math.max(...withTotals.map((g) => g.preCutTotal));
      const tied = withTotals.filter((g) => g.preCutTotal === maxTotal);
      const perGolfer = (pot * PAYOUT_PERCENTAGES.PRE_CUT_HIGH) / tied.length;
      for (const golfer of tied) {
        awardPayoutToGolferOwner(entries, purchases, golfer.name, perGolfer, 'Pre-Cut High Total',
          `${golfer.name} — Highest pre-cut total (${golfer.preCutTotal})`);
      }
    }
  } else {
    // Projected: use players not projected to make the cut
    // Use cutMakers set (handles both projected_cut and made_cut) rather than strict === false
    // This works even before projected_cut is set in the DB
    const cutMakerNames = new Set(cutMakers.map((g) => g.name));
    const projectedNonCutters = activeGolfers.filter(
      (g) => !cutMakerNames.has(g.name) && g.to_par !== null
    );
    if (projectedNonCutters.length > 0) {
      const maxPar = Math.max(...projectedNonCutters.map((g) => g.to_par!));
      const tied = projectedNonCutters.filter((g) => g.to_par === maxPar);
      const totalScore = tied[0].total_score ?? 0;
      const perGolfer = (pot * PAYOUT_PERCENTAGES.PRE_CUT_HIGH) / tied.length;
      for (const golfer of tied) {
        const tieLabel = tied.length > 1 ? ` (${tied.length}-way tie)` : '';
        awardPayoutToGolferOwner(entries, purchases, golfer.name, perGolfer,
          'Pre-Cut High Total (Projected)',
          `${golfer.name} — Projected highest pre-cut score (${golfer.to_par! >= 0 ? '+' : ''}${golfer.to_par})${tieLabel}`);
      }
    }
  }

  // 4. Post-Cut Round High — 1.6% to highest individual round score in R3 or R4
  // Only available after R2 cut and R3/R4 data exists (cannot be projected before R3 starts)
  if (r2Complete) {
    const postCutCandidates: { golfer: GolferScore; round: number; score: number }[] = [];
    for (const g of cutMakers) {
      if (g.r3_score !== null) postCutCandidates.push({ golfer: g, round: 3, score: g.r3_score });
      if (g.r4_score !== null) postCutCandidates.push({ golfer: g, round: 4, score: g.r4_score });
    }
    if (postCutCandidates.length > 0) {
      const maxScore = Math.max(...postCutCandidates.map((c) => c.score));
      const tied = postCutCandidates.filter((c) => c.score === maxScore);
      const uniqueGolfers = [...new Map(tied.map((t) => [t.golfer.name, t])).values()];
      const perGolfer = (pot * PAYOUT_PERCENTAGES.POST_CUT_RD_HIGH) / uniqueGolfers.length;
      const isFinal = r4Complete(cutMakers);
      const tag = isFinal ? '' : ' (Projected)';
      for (const entry of uniqueGolfers) {
        awardPayoutToGolferOwner(entries, purchases, entry.golfer.name, perGolfer,
          `Post-Cut Rd High${tag}`,
          `${entry.golfer.name} — Highest post-cut round (R${entry.round}: ${entry.score})`);
      }
    }
  }

  // 5. Stats Payouts — 1.2% each for best putting, driving accuracy, GIR
  // RULE: Stats can only be won by players who made the cut
  // Projected until R4 is complete (tournament over)
  if (stats.length > 0) {
    const cutMakerNames = new Set(cutMakers.map((g) => g.name.toLowerCase()));
    const cutStats = stats.filter((s) => cutMakerNames.has(s.golfer_name.toLowerCase()));
    const statsFinal = r4Complete(cutMakers);
    const statsTag = statsFinal ? '' : ' (Projected)';

    // Best Putting (lowest putts per round)
    const puttingStats = cutStats.filter((s) => s.putts_per_round !== null);
    if (puttingStats.length > 0) {
      const bestPutting = Math.min(...puttingStats.map((s) => s.putts_per_round!));
      const tiedPutting = puttingStats.filter((s) => s.putts_per_round === bestPutting);
      const perGolfer = (pot * PAYOUT_PERCENTAGES.STAT_PUTTING) / tiedPutting.length;
      for (const s of tiedPutting) {
        const tieLabel = tiedPutting.length > 1 ? ` (${tiedPutting.length}-way tie)` : '';
        awardPayoutToGolferOwner(entries, purchases, s.golfer_name, perGolfer, `Best Putting${statsTag}`,
          `${s.golfer_name} — Best putting (${bestPutting} putts/GIR)${tieLabel}`);
      }
    }

    // Best Driving Accuracy (highest %)
    const drivingStats = cutStats.filter((s) => s.driving_accuracy !== null);
    if (drivingStats.length > 0) {
      const bestDriving = Math.max(...drivingStats.map((s) => s.driving_accuracy!));
      const tiedDriving = drivingStats.filter((s) => s.driving_accuracy === bestDriving);
      const perGolfer = (pot * PAYOUT_PERCENTAGES.STAT_DRIVING) / tiedDriving.length;
      for (const s of tiedDriving) {
        const tieLabel = tiedDriving.length > 1 ? ` (${tiedDriving.length}-way tie)` : '';
        awardPayoutToGolferOwner(entries, purchases, s.golfer_name, perGolfer, `Best Driving${statsTag}`,
          `${s.golfer_name} — Best driving accuracy (${bestDriving}%)${tieLabel}`);
      }
    }

    // Best GIR (highest %)
    const girStats = cutStats.filter((s) => s.gir_pct !== null);
    if (girStats.length > 0) {
      const bestGir = Math.max(...girStats.map((s) => s.gir_pct!));
      const tiedGir = girStats.filter((s) => s.gir_pct === bestGir);
      const perGolfer = (pot * PAYOUT_PERCENTAGES.STAT_GIR) / tiedGir.length;
      for (const s of tiedGir) {
        const tieLabel = tiedGir.length > 1 ? ` (${tiedGir.length}-way tie)` : '';
        awardPayoutToGolferOwner(entries, purchases, s.golfer_name, perGolfer, `Best GIR${statsTag}`,
          `${s.golfer_name} — Best greens in regulation (${bestGir}%)${tieLabel}`);
      }
    }
  }

  // 6. Saturday Payouts — projected until all cut makers have completed R3
  // Before R3 complete: use live ESPN positions (projected)
  // After R3 complete: lock in using computed R1+R2+R3 totals (won't shift during R4)
  const satProjected = !r3Complete(cutMakers);
  const satPositions = satProjected ? undefined : computePositionsFromScores(activeGolfers, 3);
  calculatePositionPayouts(entries, purchases, activeGolfers, pot, 'Saturday', SATURDAY_PAYOUTS, satProjected, satPositions);

  // 7. Sunday Payouts — projected until all cut makers have completed R4
  // Use live ESPN positions (reflects current R4 standings, final once R4 complete)
  // If R4 is done but position 1 is tied, a playoff is likely pending — stay projected
  const r4Done = r4Complete(cutMakers);
  const tiedAtFirst = r4Done && cutMakers.filter((g) => parsePosition(g.position) === 1).length > 1;
  const sunProjected = !r4Done || tiedAtFirst;
  calculatePositionPayouts(entries, purchases, activeGolfers, pot, 'Sunday', SUNDAY_PAYOUTS, sunProjected);

  // Build participant summaries
  const participantMap = new Map<string, { spent: number; winnings: number }>();
  for (const p of purchases) {
    if (!participantMap.has(p.participant_name)) {
      participantMap.set(p.participant_name, { spent: 0, winnings: 0 });
    }
    participantMap.get(p.participant_name)!.spent += p.purchase_price;
  }
  for (const entry of entries) {
    if (!participantMap.has(entry.participant_name)) {
      participantMap.set(entry.participant_name, { spent: 0, winnings: 0 });
    }
    participantMap.get(entry.participant_name)!.winnings += entry.amount;
  }

  const summary = Array.from(participantMap.entries())
    .map(([name, data]) => ({
      participant_name: name,
      total_spent: data.spent,
      total_winnings: Math.round(data.winnings * 100) / 100,
      net: Math.round((data.winnings - data.spent) * 100) / 100,
    }))
    .sort((a, b) => b.net - a.net);

  return { entries, summary, tournament_status: tournament.status };
}

/**
 * Compute positions from cumulative round scores (for locking in day-specific standings).
 * E.g., throughRound=3 uses R1+R2+R3 totals to determine Saturday standings.
 */
function computePositionsFromScores(golfers: GolferScore[], throughRound: 3 | 4): Map<string, number> {
  const eligible = golfers.filter((g) => getEffectiveCutStatus(g) === true);
  const withTotals = eligible
    .filter((g) => {
      if (g.r1_score === null || g.r2_score === null) return false;
      if (throughRound >= 3 && g.r3_score === null) return false;
      if (throughRound >= 4 && g.r4_score === null) return false;
      return true;
    })
    .map((g) => {
      let total = (g.r1_score ?? 0) + (g.r2_score ?? 0);
      if (throughRound >= 3) total += g.r3_score ?? 0;
      if (throughRound >= 4) total += g.r4_score ?? 0;
      return { name: g.name, total };
    })
    .sort((a, b) => a.total - b.total);

  const posMap = new Map<string, number>();
  let pos = 1;
  for (let i = 0; i < withTotals.length; i++) {
    if (i > 0 && withTotals[i].total > withTotals[i - 1].total) {
      pos = i + 1;
    }
    posMap.set(withTotals[i].name, pos);
  }
  return posMap;
}

function calculatePositionPayouts(
  entries: PayoutEntry[],
  purchases: AuctionPurchase[],
  golfers: GolferScore[],
  pot: number,
  day: string,
  payoutTable: number[],
  isProjected: boolean,
  positionOverride?: Map<string, number>
): void {
  const eligible = golfers.filter((g) => getEffectiveCutStatus(g) === true);
  if (eligible.length === 0) return;

  const tag = isProjected ? ' (Projected)' : '';

  // Group golfers by their numeric position (computed or live)
  const positionGroups = new Map<number, GolferScore[]>();
  for (const g of eligible) {
    const pos = positionOverride ? positionOverride.get(g.name) : (g.position ? parsePosition(g.position) : null);
    if (pos === null || pos === undefined || pos > 10) continue;
    if (!positionGroups.has(pos)) positionGroups.set(pos, []);
    positionGroups.get(pos)!.push(g);
  }

  // Process each position group
  const processedPositions = new Set<number>();
  const sortedPositions = [...positionGroups.keys()].sort((a, b) => a - b);

  for (const pos of sortedPositions) {
    if (processedPositions.has(pos)) continue;

    const tiedGolfers = positionGroups.get(pos)!;
    const numTied = tiedGolfers.length;

    // Sum the payouts for all positions these tied golfers occupy
    let totalPayout = 0;
    for (let i = pos - 1; i < pos - 1 + numTied && i < payoutTable.length; i++) {
      totalPayout += pot * payoutTable[i];
    }

    const perGolfer = totalPayout / numTied;

    for (const golfer of tiedGolfers) {
      const tieLabel = numTied > 1 ? ` (T${pos}, ${numTied}-way tie)` : '';
      awardPayoutToGolferOwner(
        entries,
        purchases,
        golfer.name,
        perGolfer,
        `${day} Top 10${tag}`,
        `${golfer.name} — ${day} position ${pos}${tieLabel}`
      );
    }

    // Mark these positions as processed
    for (let i = pos; i < pos + numTied; i++) {
      processedPositions.add(i);
    }
  }
}
