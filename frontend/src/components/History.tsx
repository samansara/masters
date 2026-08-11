import { useState, useEffect } from 'preact/hooks';

interface HistoricalGolfer {
  player: string;
  bidder: string;
  price: number;
  cut: number;
  low_am: number;
  high_score: number;
  stats: number;
  sat: number;
  sun: number;
  payout: number;
  net: number;
}

interface HistoricalParticipant {
  name: string;
  total_spent: number;
  total_payout: number;
  net: number;
  golfers: HistoricalGolfer[];
}

interface AllTimeSummary {
  name: string;
  auctions: number;
  total_spent: number;
  total_payout: number;
  net: number;
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function netClass(net: number): string {
  if (net > 0) return 'money-positive';
  if (net < 0) return 'money-negative';
  return 'money-neutral';
}

export function History() {
  const [years, setYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [participants, setParticipants] = useState<HistoricalParticipant[]>([]);
  const [allTime, setAllTime] = useState<AllTimeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [allTimeOpen, setAllTimeOpen] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/historical/years').then((r) => r.json()),
      fetch('/api/historical/all-time').then((r) => r.json()),
    ])
      .then(([yearsData, allTimeData]: any[]) => {
        setYears(yearsData.years || []);
        setAllTime(allTimeData.participants || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedYear === null) {
      setParticipants([]);
      return;
    }
    setLoading(true);
    fetch(`/api/historical/${selectedYear}`)
      .then((r) => r.json())
      .then((data: any) => {
        setParticipants(data.participants || []);
        setLoading(false);
        setExpandedIdx(null);
      })
      .catch(() => setLoading(false));
  }, [selectedYear]);

  if (loading && years.length === 0) {
    return (
      <div class="card p-8 text-center text-gray-500">
        <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-masters-green mx-auto mb-2"></div>
        <p class="text-sm">Loading history...</p>
      </div>
    );
  }

  if (years.length === 0) {
    return (
      <div class="card p-8 text-center text-gray-500">
        <p class="text-lg font-medium">No historical data yet</p>
        <p class="text-sm mt-1">Upload past auction results via the <a href="/admin" class="text-masters-green underline">Admin page</a>.</p>
      </div>
    );
  }

  return (
    <div class="space-y-4">
      {/* Year Selector */}
      <div class="flex items-center gap-3 flex-wrap">
        {years.map((y) => (
          <button
            key={y}
            onClick={() => setSelectedYear(y === selectedYear ? null : y)}
            class={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              y === selectedYear
                ? 'bg-masters-green text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {y}
          </button>
        ))}
      </div>

      {loading && selectedYear && (
        <div class="card p-6 text-center text-gray-500">
          <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-masters-green mx-auto"></div>
        </div>
      )}

      {!loading && selectedYear && participants.length > 0 && (() => {
        const totalPot = participants.reduce((sum, p) => sum + p.total_spent, 0);
        return (
        <div class="card">
          <div class="px-4 py-3 bg-masters-green text-white text-sm font-semibold flex items-center justify-between">
            <span>{selectedYear} Auction Results</span>
            {totalPot > 0 && <span class="text-white/70 text-xs font-normal">Total Pot: {formatMoney(totalPot)}</span>}
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-gray-200 text-xs uppercase text-gray-500">
                  <th class="px-4 py-2 text-left w-8">#</th>
                  <th class="px-4 py-2 text-left">Participant</th>
                  <th class="px-4 py-2 text-right">Golfers</th>
                  <th class="px-4 py-2 text-right">Spent</th>
                  <th class="px-4 py-2 text-right">Payout</th>
                  <th class="px-4 py-2 text-right">Net</th>
                  <th class="px-4 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {participants.map((p, i) => {
                  const isExpanded = expandedIdx === i;
                  return (
                    <>
                      <tr
                        key={p.name}
                        class={`border-b border-gray-100 cursor-pointer transition-colors ${
                          isExpanded ? 'bg-green-50' : 'hover:bg-gray-50'
                        }`}
                        onClick={() => setExpandedIdx(isExpanded ? null : i)}
                      >
                        <td class="px-4 py-3">
                          <div class={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                            i < 3 ? 'bg-masters-gold/20 text-masters-green-dark' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {i + 1}
                          </div>
                        </td>
                        <td class="px-4 py-3 font-semibold text-gray-900">{p.name}</td>
                        <td class="px-4 py-3 text-right text-gray-500 font-mono text-xs">{p.golfers.length}</td>
                        <td class="px-4 py-3 text-right text-gray-500 font-mono">{formatMoney(p.total_spent)}</td>
                        <td class="px-4 py-3 text-right font-mono money-positive">{formatMoney(p.total_payout)}</td>
                        <td class={`px-4 py-3 text-right font-mono font-bold ${netClass(p.net)}`}>
                          {p.net >= 0 ? '+' : ''}{formatMoney(p.net)}
                        </td>
                        <td class="px-4 py-3 text-gray-400 text-xs">{isExpanded ? '▲' : '▼'}</td>
                      </tr>

                      {isExpanded && (
                        <tr key={`${p.name}-detail`}>
                          <td colSpan={7} class="px-0 py-0 bg-gray-50">
                            <div class="px-6 py-4">
                              <h4 class="text-xs font-semibold uppercase text-gray-400 mb-2">Golfer Breakdown</h4>
                              <div class="overflow-x-auto">
                                <table class="w-full text-xs">
                                  <thead>
                                    <tr class="text-[10px] uppercase text-gray-400 border-b border-gray-200">
                                      <th class="px-2 py-1 text-left">Golfer</th>
                                      <th class="px-2 py-1 text-right">Cost</th>
                                      <th class="px-2 py-1 text-right">Cut</th>
                                      <th class="px-2 py-1 text-right">Sat</th>
                                      <th class="px-2 py-1 text-right">Sun</th>
                                      <th class="px-2 py-1 text-right">Low Am</th>
                                      <th class="px-2 py-1 text-right">High</th>
                                      <th class="px-2 py-1 text-right">Stats</th>
                                      <th class="px-2 py-1 text-right">Payout</th>
                                      <th class="px-2 py-1 text-right">Net</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {p.golfers
                                      .sort((a, b) => b.net - a.net)
                                      .map((g) => (
                                        <tr key={g.player} class="border-t border-gray-100 hover:bg-white">
                                          <td class="px-2 py-1.5 font-medium text-gray-800">{g.player}</td>
                                          <td class="px-2 py-1.5 text-right font-mono text-gray-500">{formatMoney(g.price)}</td>
                                          <td class="px-2 py-1.5 text-right font-mono text-gray-500">{g.cut > 0 ? formatMoney(g.cut) : '-'}</td>
                                          <td class="px-2 py-1.5 text-right font-mono text-gray-500">{g.sat > 0 ? formatMoney(g.sat) : '-'}</td>
                                          <td class="px-2 py-1.5 text-right font-mono text-gray-500">{g.sun > 0 ? formatMoney(g.sun) : '-'}</td>
                                          <td class="px-2 py-1.5 text-right font-mono text-gray-500">{g.low_am > 0 ? formatMoney(g.low_am) : '-'}</td>
                                          <td class="px-2 py-1.5 text-right font-mono text-gray-500">{g.high_score > 0 ? formatMoney(g.high_score) : '-'}</td>
                                          <td class="px-2 py-1.5 text-right font-mono text-gray-500">{g.stats > 0 ? formatMoney(g.stats) : '-'}</td>
                                          <td class="px-2 py-1.5 text-right font-mono money-positive">{g.payout > 0 ? formatMoney(g.payout) : '-'}</td>
                                          <td class={`px-2 py-1.5 text-right font-mono font-semibold ${netClass(g.net)}`}>
                                            {g.net >= 0 ? '+' : ''}{formatMoney(g.net)}
                                          </td>
                                        </tr>
                                      ))}
                                  </tbody>
                                </table>
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
        </div>
        );
      })()}

      {/* All-Time Summary */}
      {allTime.length > 0 && (
        <div class="card">
          <div
            class="px-4 py-3 bg-masters-green text-white text-sm font-semibold flex items-center justify-between cursor-pointer"
            onClick={() => setAllTimeOpen(!allTimeOpen)}
          >
            <span>All-Time Standings</span>
            <span class="text-white/60 text-xs">{allTimeOpen ? '▲' : '▼'}</span>
          </div>
          {allTimeOpen && <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-gray-200 text-xs uppercase text-gray-500">
                  <th class="px-4 py-2 text-left w-8">#</th>
                  <th class="px-4 py-2 text-left">Participant</th>
                  <th class="px-4 py-2 text-right">Auctions</th>
                  <th class="px-4 py-2 text-right">Wagered</th>
                  <th class="px-4 py-2 text-right">Won</th>
                  <th class="px-4 py-2 text-right">Net</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50">
                {allTime.map((p, i) => (
                  <tr key={p.name} class="hover:bg-gray-50">
                    <td class="px-4 py-2">
                      <div class={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                        i < 3 ? 'bg-masters-gold/20 text-masters-green-dark' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {i + 1}
                      </div>
                    </td>
                    <td class="px-4 py-2 font-semibold text-gray-900">{p.name}</td>
                    <td class="px-4 py-2 text-right text-gray-500 font-mono">{p.auctions}</td>
                    <td class="px-4 py-2 text-right text-gray-500 font-mono">{formatMoney(p.total_spent)}</td>
                    <td class="px-4 py-2 text-right font-mono money-positive">{formatMoney(p.total_payout)}</td>
                    <td class={`px-4 py-2 text-right font-mono font-bold ${netClass(p.net)}`}>
                      {p.net >= 0 ? '+' : ''}{formatMoney(p.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </div>
      )}
    </div>
  );
}
