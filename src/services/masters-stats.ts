/**
 * Fetches tournament statistics from Masters.com JSON feeds.
 * 
 * Feed URLs:
 *   Driving Accuracy: /en_US/scores/feeds/{year}/stats/fir.json
 *   Putting:          /en_US/scores/feeds/{year}/stats/putts.json
 *   GIR:              /en_US/scores/feeds/{year}/stats/gir.json
 *
 * Each feed returns per-round and total stats in the `player` array.
 * We only care about the `total` field in stats[0].
 */

export interface MastersStatPlayer {
  id: string;
  name: string;
  stats: { total: string; round1?: string; round2?: string; round3?: string; round4?: string }[];
}

export interface MastersStatsFeed {
  player: MastersStatPlayer[];
}

export interface PlayerStats {
  player_id: string;
  name: string;
  driving_accuracy: number | null;
  putts_per_round: number | null;
  gir_pct: number | null;
}

const MASTERS_STATS_BASE = 'https://www.masters.com/en_US/scores/feeds';

/**
 * Parse the "total" string from a Masters.com stats feed.
 * 
 * GIR/FIR format: "58 / 72 = 80.56%"  → we want the percentage (80.56)
 * Putts format:   "112" or "28.00"     → we want the numeric value
 */
function parseTotalStat(total: string | undefined, type: 'pct' | 'num'): number | null {
  if (!total || total.trim() === '' || total === '--') return null;

  if (type === 'pct') {
    // Extract percentage from "X / Y = Z%"
    const pctMatch = total.match(/([\d.]+)%/);
    if (pctMatch) return parseFloat(pctMatch[1]);
    // Fallback: try parsing as a direct number
    const num = parseFloat(total);
    return isNaN(num) ? null : num;
  }

  // Numeric: putts total or per-round average
  const num = parseFloat(total);
  return isNaN(num) ? null : num;
}

async function fetchStatFeed(year: number, stat: string): Promise<MastersStatsFeed | null> {
  const url = `${MASTERS_STATS_BASE}/${year}/stats/${stat}.json`;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MastersAuction/1.0)' },
    });
    if (!response.ok) {
      console.log(`[STATS] ${stat}.json returned ${response.status}`);
      return null;
    }
    return await response.json() as MastersStatsFeed;
  } catch (err) {
    console.error(`[STATS] Failed to fetch ${stat}.json: ${err}`);
    return null;
  }
}

export async function fetchMastersStats(year: number): Promise<PlayerStats[]> {
  const [firData, puttsData, girData] = await Promise.all([
    fetchStatFeed(year, 'fir'),
    fetchStatFeed(year, 'putts'),
    fetchStatFeed(year, 'gir'),
  ]);

  // Build a map keyed by player name (lowercase) to aggregate stats
  const statsMap = new Map<string, PlayerStats>();

  function ensurePlayer(id: string, name: string): PlayerStats {
    const key = name.toLowerCase();
    if (!statsMap.has(key)) {
      statsMap.set(key, {
        player_id: id,
        name,
        driving_accuracy: null,
        putts_per_round: null,
        gir_pct: null,
      });
    }
    return statsMap.get(key)!;
  }

  // Driving accuracy (fir.json) — percentage
  if (firData?.player) {
    for (const p of firData.player) {
      const player = ensurePlayer(p.id, p.name);
      player.driving_accuracy = parseTotalStat(p.stats?.[0]?.total, 'pct');
    }
  }

  // Putting (putts.json) — numeric (total putts or per-round avg)
  if (puttsData?.player) {
    for (const p of puttsData.player) {
      const player = ensurePlayer(p.id, p.name);
      player.putts_per_round = parseTotalStat(p.stats?.[0]?.total, 'num');
    }
  }

  // GIR (gir.json) — percentage
  if (girData?.player) {
    for (const p of girData.player) {
      const player = ensurePlayer(p.id, p.name);
      player.gir_pct = parseTotalStat(p.stats?.[0]?.total, 'pct');
    }
  }

  return Array.from(statsMap.values());
}
