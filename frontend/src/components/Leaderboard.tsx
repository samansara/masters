import { useState, useMemo } from 'preact/hooks';

interface PayoutEntry {
  participant_name: string;
  payout_type: string;
  amount: number;
  golfer_name: string | null;
  description: string;
}

interface LeaderboardEntry {
  position: string | null;
  name: string;
  to_par: number | null;
  thru: string | null;
  r1: number | null;
  r2: number | null;
  r3: number | null;
  r4: number | null;
  total: number | null;
  is_amateur: boolean;
  made_cut: boolean | null;
  projected_cut: boolean | null;
  status: string;
  owner: string | null;
}

interface CutInfo {
  cut_line: number;
  espn_cut_score: number | null;
  espn_cut_count: number | null;
  is_final: boolean;
  current_round: number | null;
  round_state: string | null;
}

function formatToPar(toPar: number | null): string {
  if (toPar === null) return '-';
  if (toPar === 0) return 'E';
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}

function toParClass(toPar: number | null): string {
  if (toPar === null) return 'text-gray-400';
  if (toPar < 0) return 'text-red-600 font-semibold';
  if (toPar === 0) return 'text-gray-700 font-medium';
  return 'text-gray-500';
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatCutScore(score: number | null): string {
  if (score === null) return '';
  if (score === 0) return 'E';
  return score > 0 ? `+${score}` : `${score}`;
}

export function Leaderboard({ entries, payouts = [], cutInfo }: { entries: LeaderboardEntry[]; payouts?: PayoutEntry[]; cutInfo?: CutInfo | null }) {
  const [search, setSearch] = useState('');
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);

  if (entries.length === 0) {
    return (
      <div class="card p-8 text-center text-gray-500">
        <p class="text-lg font-medium">No leaderboard data yet</p>
        <p class="text-sm mt-1">Data will appear once the tournament begins and scores are ingested.</p>
      </div>
    );
  }

  const query = search.toLowerCase().trim();
  const filtered = query
    ? entries.filter((e) => e.name.toLowerCase().includes(query) || e.owner?.toLowerCase().includes(query))
    : entries;

  const payoutsByGolfer = useMemo(() => {
    const map = new Map<string, PayoutEntry[]>();
    for (const p of payouts) {
      if (!p.golfer_name) continue;
      const key = p.golfer_name.toLowerCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [payouts]);

  // Determine effective cut status: made_cut (final) takes priority, then projected_cut
  const getEffectiveCut = (e: LeaderboardEntry): boolean | null => {
    if (e.made_cut !== null) return e.made_cut;
    if (e.projected_cut !== null) return e.projected_cut;
    return null;
  };

  // Before cut is final: show all players in one table with a projected cut line break
  // After cut is final: split into made/missed sections
  const cutIsFinal = cutInfo?.is_final ?? false;
  const mainList = cutIsFinal
    ? filtered.filter((e) => getEffectiveCut(e) === true || getEffectiveCut(e) === null)
    : filtered;
  const cutMissed = cutIsFinal
    ? filtered.filter((e) => getEffectiveCut(e) === false)
    : [];

  // Find the index where the projected cut line should appear (last player making the projected cut)
  const showCutLine = cutInfo && !cutIsFinal && !query;
  let cutLineIndex = -1;
  if (showCutLine) {
    for (let i = 0; i < mainList.length; i++) {
      if (getEffectiveCut(mainList[i]) === true) {
        cutLineIndex = i;
      }
    }
  }

  const cutLabel = cutInfo
    ? cutInfo.is_final
      ? `Cut: ${formatCutScore(cutInfo.espn_cut_score)}${cutInfo.espn_cut_count ? ` (${cutInfo.espn_cut_count} players)` : ''}`
      : `Projected Cut: ${cutInfo.espn_cut_score !== null ? formatCutScore(cutInfo.espn_cut_score) : `Top ${cutInfo.cut_line} + ties`}`
    : null;

  return (
    <div class="space-y-4">
      {/* Search */}
      <div class="relative">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
          placeholder="Search by player or owner..."
          class="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-masters-green/30 focus:border-masters-green bg-white"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {query && filtered.length === 0 && (
        <div class="card p-6 text-center text-gray-500 text-sm">
          No players or owners matching "{search}"
        </div>
      )}

      {/* Active / Made Cut */}
      <div class="card">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-masters-green text-white text-xs uppercase tracking-wider">
                <th class="px-3 py-2 text-left w-12">Pos</th>
                <th class="px-3 py-2 text-left">Player</th>
                <th class="px-3 py-2 text-center">To Par</th>
                <th class="px-3 py-2 text-center hidden sm:table-cell">Thru</th>
                <th class="px-3 py-2 text-center hidden md:table-cell">R1</th>
                <th class="px-3 py-2 text-center hidden md:table-cell">R2</th>
                <th class="px-3 py-2 text-center hidden md:table-cell">R3</th>
                <th class="px-3 py-2 text-center hidden md:table-cell">R4</th>
                <th class="px-3 py-2 text-center hidden sm:table-cell">Total</th>
                <th class="px-3 py-2 text-left">Owner</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              {mainList.map((entry, i) => {
                const golferPayouts = payoutsByGolfer.get(entry.name.toLowerCase()) || [];
                const isExpanded = expandedPlayer === entry.name;
                const hasPayouts = golferPayouts.length > 0;
                const showCutAfter = showCutLine && i === cutLineIndex;
                return (
                  <>
                    <tr
                      key={`${entry.name}-${i}`}
                      onClick={hasPayouts ? () => setExpandedPlayer(isExpanded ? null : entry.name) : undefined}
                      class={`transition-colors ${
                        entry.owner ? 'bg-yellow-50/40' : ''
                      } ${hasPayouts ? 'cursor-pointer hover:bg-green-50/50' : 'hover:bg-green-50/50'} ${
                        isExpanded ? 'bg-green-50' : ''
                      }`}
                    >
                      <td class="px-3 py-2 font-mono text-xs text-gray-500">
                        {entry.position || '-'}
                      </td>
                      <td class="px-3 py-2 font-medium">
                        <div class="flex items-center gap-1.5">
                          {entry.name}
                          {entry.is_amateur && (
                            <span class="badge badge-amateur text-[10px]">AM</span>
                          )}
                          {entry.status === 'WD' && (
                            <span class="badge badge-missed text-[10px]">WD</span>
                          )}
                          {entry.status === 'DQ' && (
                            <span class="badge badge-missed text-[10px]">DQ</span>
                          )}
                          {hasPayouts && (
                            <svg class={`w-3 h-3 text-masters-green transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                            </svg>
                          )}
                        </div>
                      </td>
                      <td class={`px-3 py-2 text-center font-mono ${toParClass(entry.to_par)}`}>
                        {formatToPar(entry.to_par)}
                      </td>
                      <td class="px-3 py-2 text-center text-gray-500 hidden sm:table-cell">
                        {entry.thru || '-'}
                      </td>
                      <td class="px-3 py-2 text-center text-gray-500 font-mono hidden md:table-cell">
                        {entry.r1 ?? '-'}
                      </td>
                      <td class="px-3 py-2 text-center text-gray-500 font-mono hidden md:table-cell">
                        {entry.r2 ?? '-'}
                      </td>
                      <td class="px-3 py-2 text-center text-gray-500 font-mono hidden md:table-cell">
                        {entry.r3 ?? '-'}
                      </td>
                      <td class="px-3 py-2 text-center text-gray-500 font-mono hidden md:table-cell">
                        {entry.r4 ?? '-'}
                      </td>
                      <td class="px-3 py-2 text-center font-mono hidden sm:table-cell">
                        {entry.total ?? '-'}
                      </td>
                      <td class="px-3 py-2 text-xs">
                        {entry.owner ? (
                          <span class="inline-flex items-center px-2 py-0.5 rounded-full bg-masters-green/10 text-masters-green font-medium">
                            {entry.owner}
                          </span>
                        ) : (
                          <span class="text-gray-300">-</span>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${entry.name}-payouts`} class="bg-green-50/80">
                        <td colSpan={10} class="px-4 py-2">
                          <div class="space-y-1">
                            {golferPayouts.map((p, j) => (
                              <div key={`${p.payout_type}-${j}`} class="flex items-center justify-between text-sm">
                                <div class="flex items-center gap-2">
                                  <span class="text-xs text-gray-500">{p.payout_type}</span>
                                </div>
                                <span class="font-mono text-sm text-green-600 font-medium">
                                  {formatMoney(p.amount)}
                                </span>
                              </div>
                            ))}
                            <div class="flex items-center justify-between text-sm font-semibold border-t border-green-200 pt-1 mt-1">
                              <span class="text-gray-700">Total Earnings</span>
                              <span class="font-mono text-green-600">
                                {formatMoney(golferPayouts.reduce((sum, p) => sum + p.amount, 0))}
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    {showCutAfter && (
                      <tr key="cut-line">
                        <td colSpan={10} class="px-0 py-0">
                          <div class="flex items-center gap-2 px-3 py-1.5 bg-red-50 border-y border-red-200">
                            <div class="flex-1 h-px bg-red-300"></div>
                            <span class="text-xs font-semibold text-red-600 uppercase tracking-wide whitespace-nowrap">
                              {cutLabel}
                            </span>
                            <div class="flex-1 h-px bg-red-300"></div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Missed Cut */}
      {cutMissed.length > 0 && (
        <details class="card">
          <summary class="px-4 py-3 cursor-pointer text-sm font-medium text-gray-600 hover:text-gray-800 bg-gray-50">
            Missed Cut ({cutMissed.length} players)
          </summary>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <tbody class="divide-y divide-gray-100">
                {cutMissed.map((entry, i) => {
                  const golferPayouts = payoutsByGolfer.get(entry.name.toLowerCase()) || [];
                  const isExpanded = expandedPlayer === entry.name;
                  const hasPayouts = golferPayouts.length > 0;
                  return (
                    <>
                      <tr
                        key={`cut-${entry.name}-${i}`}
                        onClick={hasPayouts ? () => setExpandedPlayer(isExpanded ? null : entry.name) : undefined}
                        class={`text-gray-400 transition-colors ${hasPayouts ? 'cursor-pointer hover:bg-green-50/50' : ''} ${isExpanded ? 'bg-green-50 !text-gray-600' : ''}`}
                      >
                        <td class="px-3 py-2 font-mono text-xs w-12">CUT</td>
                        <td class="px-3 py-2">
                          <div class="flex items-center gap-1.5">
                            {entry.name}
                            {entry.is_amateur && (
                              <span class="badge badge-amateur text-[10px]">AM</span>
                            )}
                            {hasPayouts && (
                              <svg class={`w-3 h-3 text-masters-green transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                              </svg>
                            )}
                          </div>
                        </td>
                        <td class="px-3 py-2 text-center font-mono">
                          {formatToPar(entry.to_par)}
                        </td>
                        <td class="px-3 py-2 text-center font-mono hidden md:table-cell">
                          {entry.r1 ?? '-'}
                        </td>
                        <td class="px-3 py-2 text-center font-mono hidden md:table-cell">
                          {entry.r2 ?? '-'}
                        </td>
                        <td class="px-3 py-2 text-xs">
                          {entry.owner ? (
                            <span class="text-masters-green/60">{entry.owner}</span>
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${entry.name}-payouts`} class="bg-green-50/80">
                          <td colSpan={6} class="px-4 py-2">
                            <div class="space-y-1">
                              {golferPayouts.map((p, j) => (
                                <div key={`${p.payout_type}-${j}`} class="flex items-center justify-between text-sm">
                                  <span class="text-xs text-gray-500">{p.payout_type}</span>
                                  <span class="font-mono text-sm text-green-600 font-medium">
                                    {formatMoney(p.amount)}
                                  </span>
                                </div>
                              ))}
                              <div class="flex items-center justify-between text-sm font-semibold border-t border-green-200 pt-1 mt-1">
                                <span class="text-gray-700">Total Earnings</span>
                                <span class="font-mono text-green-600">
                                  {formatMoney(golferPayouts.reduce((sum, p) => sum + p.amount, 0))}
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
