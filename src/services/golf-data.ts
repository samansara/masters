export interface RawGolferData {
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

const ESPN_LEADERBOARD_URL = 'https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=pga&region=us&lang=en';

export interface ESPNRoundStatus {
  round: number;       // 1-4 (competition.status.period)
  state: string;       // 'pre' | 'in' | 'post'
  detail: string;      // e.g. "Round 2 - In Progress"
}

export interface ESPNLeaderboardResult {
  golfers: RawGolferData[];
  eventId: string | null;
  cutScore: number | null;
  cutCount: number | null;
  roundStatus: ESPNRoundStatus | null;
}

export interface ESPNPlayerStats {
  name: string;
  driving_accuracy: number | null;
  gir_pct: number | null;
  putts_per_gir: number | null;
}

export async function fetchESPNTournamentName(): Promise<string | null> {
  try {
    const response = await fetch(ESPN_LEADERBOARD_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MastersAuction/1.0)' },
    });
    if (!response.ok) return null;
    const data = await response.json() as any;
    return data.events?.[0]?.name || data.events?.[0]?.shortName || null;
  } catch {
    return null;
  }
}

export async function fetchESPNLeaderboard(): Promise<ESPNLeaderboardResult> {
  const url = ESPN_LEADERBOARD_URL;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MastersAuction/1.0)' },
  });

  if (!response.ok) {
    throw new Error(`ESPN API returned ${response.status}: ${response.statusText}`);
  }

  const data = await response.json() as any;
  const golfers: RawGolferData[] = [];

  if (!data.events || data.events.length === 0) {
    return { golfers, eventId: null, cutScore: null, cutCount: null, roundStatus: null };
  }

  const event = data.events[0];
  const eventId = event.id || null;
  const competition = event.competitions?.[0];
  if (!competition?.competitors) return { golfers, eventId, cutScore: null, cutCount: null, roundStatus: null };

  // Extract round status from competition
  const compStatus = competition.status;
  const roundStatus: ESPNRoundStatus | null = compStatus ? {
    round: compStatus.period ?? 1,
    state: compStatus.type?.state || 'pre',
    detail: compStatus.type?.shortDetail || compStatus.type?.detail || '',
  } : null;

  // Extract cut info from tournament data (available after R2)
  const tournamentData = competition.tournament || event.tournament || {};
  const cutScore: number | null = tournamentData.cutScore ?? null;
  const cutCount: number | null = tournamentData.cutCount ?? null;

  for (const competitor of competition.competitors) {
    const athlete = competitor.athlete;
    const status = competitor.status;
    const linescores = competitor.linescores || [];

    // linescores[i].value = actual stroke total for that round
    const r1 = linescores[0]?.value ?? null;
    const r2 = linescores[1]?.value ?? null;
    const r3 = linescores[2]?.value ?? null;
    const r4 = linescores[3]?.value ?? null;

    // Only count completed rounds (value > 0 and displayValue is not "-")
    const validR1 = (r1 && linescores[0]?.displayValue !== '-') ? r1 : null;
    const validR2 = (r2 && linescores[1]?.displayValue !== '-') ? r2 : null;
    const validR3 = (r3 && linescores[2]?.displayValue !== '-') ? r3 : null;
    const validR4 = (r4 && linescores[3]?.displayValue !== '-') ? r4 : null;

    const rounds = [validR1, validR2, validR3, validR4].filter((s): s is number => s !== null);
    const totalScore = rounds.length > 0 ? rounds.reduce((sum, s) => sum + s, 0) : null;

    // to_par from statistics array (scoreToPar has numeric value)
    let toPar: number | null = null;
    const scoreToParStat = (competitor.statistics || []).find((s: any) => s.name === 'scoreToPar');
    if (scoreToParStat && competitor.score?.displayValue !== '-') {
      toPar = scoreToParStat.value;
    }

    // Position from status.position.displayName (e.g., "T10", "1", "-")
    const posDisplay = status?.position?.displayName || null;
    const position = (posDisplay && posDisplay !== '-') ? posDisplay : null;

    // Use shortDetail as primary signal for terminal states: "CUT", "WD", "F"
    // For active/mid-round players it may show score info, so fall back to other fields
    const shortDetail = (status?.type?.shortDetail || '').trim().toUpperCase();
    const statusDesc = (status?.type?.description || '').toLowerCase();

    let playerStatus = 'active';
    if (shortDetail === 'WD' || statusDesc.includes('withdraw') || statusDesc === 'wd') {
      playerStatus = 'WD';
    } else if (shortDetail === 'DQ' || statusDesc.includes('disqualif') || statusDesc === 'dq') {
      playerStatus = 'DQ';
    } else if (shortDetail === 'CUT' || statusDesc.includes('cut')) {
      playerStatus = 'CUT';
    }

    // Thru: use shortDetail for finished states, fall back to displayThru for mid-round
    let thru: string | null = null;
    if (shortDetail === 'F' || shortDetail === 'CUT' || playerStatus === 'CUT') {
      thru = 'F';
    } else if (status?.displayThru) {
      thru = status.displayThru === '18' ? 'F' : status.displayThru;
    } else if (status?.thru > 0) {
      thru = status.thru === 18 ? 'F' : `${status.thru}`;
    }

    const isAmateur = athlete?.amateur === true || competitor?.amateur === true;

    // Determine if player made the cut
    // Only set madeCut after R2 is complete — during R1/R2, projected_cut handles projection
    const r2Done = roundStatus && (roundStatus.round > 2 || (roundStatus.round === 2 && roundStatus.state === 'post'));
    let madeCut: boolean | null = null;
    if (playerStatus === 'CUT') {
      madeCut = false;
    } else if (r2Done && shortDetail === 'F' && validR2 !== null) {
      // R2 complete, player finished, not CUT = made the cut
      madeCut = true;
    } else if (validR3 !== null) {
      // Has R3 data = definitely made the cut
      madeCut = true;
    } else if (playerStatus === 'WD' || playerStatus === 'DQ') {
      // WD/DQ without R3 data = missed the cut (withdrew before or during R1/R2)
      madeCut = false;
    }

    golfers.push({
      player_id: competitor.id || athlete?.id || `unknown-${golfers.length}`,
      name: athlete?.displayName || 'Unknown',
      is_amateur: isAmateur,
      r1_score: validR1,
      r2_score: validR2,
      r3_score: validR3,
      r4_score: validR4,
      total_score: totalScore,
      to_par: toPar,
      position,
      made_cut: madeCut,
      thru,
      status: playerStatus === 'CUT' ? 'active' : playerStatus,
    });
  }

  return { golfers, eventId, cutScore, cutCount, roundStatus };
}

const ESPN_PLAYERS_URL = 'https://site.web.api.espn.com/apis/site/v2/sports/golf/pga/leaderboard/players?region=us&lang=en';

export async function fetchESPNPlayerStats(eventId: string): Promise<ESPNPlayerStats[]> {
  const url = `${ESPN_PLAYERS_URL}&event=${eventId}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MastersAuction/1.0)' },
  });

  if (!response.ok) {
    throw new Error(`ESPN Players API returned ${response.status}: ${response.statusText}`);
  }

  const data = await response.json() as any;
  const players: ESPNPlayerStats[] = [];

  if (!data.leaderboard || data.leaderboard.length === 0) {
    return players;
  }

  for (const player of data.leaderboard) {
    const statsArr = player.stats || [];
    const getStat = (name: string): number | null => {
      const s = statsArr.find((st: any) => st.name === name);
      return s?.value ?? null;
    };

    players.push({
      name: player.displayName || player.fullName || 'Unknown',
      driving_accuracy: getStat('driveAccuracyPct'),
      gir_pct: getStat('gir'),
      putts_per_gir: getStat('puttsGirAvg'),
    });
  }

  return players;
}

export async function fetchMastersLeaderboard(year: number): Promise<RawGolferData[]> {
  const url = `https://www.masters.com/en_US/scores/feeds/${year}/scores.json`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'MastersAuction/1.0' },
  });

  if (!response.ok) {
    throw new Error(`Masters.com returned ${response.status}`);
  }

  const data = await response.json() as any;
  const golfers: RawGolferData[] = [];

  const players = data.data?.player || [];
  for (const player of players) {
    const rounds = player.rounds || [];
    const r1 = rounds[0]?.strokes ?? null;
    const r2 = rounds[1]?.strokes ?? null;
    const r3 = rounds[2]?.strokes ?? null;
    const r4 = rounds[3]?.strokes ?? null;

    const totalScore = [r1, r2, r3, r4].filter((s): s is number => s !== null)
      .reduce((sum, s) => sum + s, 0) || null;

    const toPar = player.topar !== undefined ? parseInt(player.topar, 10) : null;

    let madeCut: boolean | null = null;
    if (player.status === 'C') madeCut = false;
    else if (r3 !== null) madeCut = true;

    golfers.push({
      player_id: player.id?.toString() || `masters-${golfers.length}`,
      name: `${player.first_name} ${player.last_name}`.trim(),
      is_amateur: player.amateur === true || player.amateur === 'Y',
      r1_score: r1,
      r2_score: r2,
      r3_score: r3,
      r4_score: r4,
      total_score: totalScore,
      to_par: isNaN(toPar as number) ? null : toPar,
      position: player.pos || null,
      made_cut: madeCut,
      thru: player.thru || null,
      status: player.status === 'W' ? 'WD' : player.status === 'D' ? 'DQ' : 'active',
    });
  }

  return golfers;
}
