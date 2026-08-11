import { useState } from 'preact/hooks';

interface GolferPayout {
  type: string;
  amount: number;
}

interface Golfer {
  name: string;
  price: number;
  won: number;
  net: number;
  position: string | null;
  to_par: number | null;
  made_cut: boolean | null;
  thru: string | null;
  status: string;
  payouts: GolferPayout[];
}

interface Participant {
  name: string;
  total_spent: number;
  total_winnings: number;
  net: number;
  golfers: Golfer[];
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatToPar(toPar: number | null): string {
  if (toPar === null) return '-';
  if (toPar === 0) return 'E';
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}

function netClass(net: number): string {
  if (net > 0) return 'money-positive';
  if (net < 0) return 'money-negative';
  return 'money-neutral';
}

export function Participants({
  participants,
  totalPot,
}: {
  participants: Participant[];
  totalPot: number;
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [expandedGolfers, setExpandedGolfers] = useState<Set<string>>(new Set());

  if (participants.length === 0) {
    return (
      <div class="card p-8 text-center text-gray-500">
        <p class="text-lg font-medium">No participants yet</p>
        <p class="text-sm mt-1">Upload auction data to see participants and their golfers.</p>
      </div>
    );
  }

  return (
    <div class="card">
      <div class="px-4 py-3 bg-masters-green text-white text-sm font-semibold">
        Participant Leaderboard
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-200 text-xs uppercase text-gray-500">
              <th class="px-4 py-2 text-left w-8">#</th>
              <th class="px-4 py-2 text-left">Participant</th>
              <th class="px-4 py-2 text-right">Golfers</th>
              <th class="px-4 py-2 text-right">Spent</th>
              <th class="px-4 py-2 text-right">Won</th>
              <th class="px-4 py-2 text-right">Net</th>
              <th class="px-4 py-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {participants.map((p, i) => {
              const isExpanded = expandedIdx === i;
              const rank = i + 1;

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
                      <div
                        class={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                          rank <= 3
                            ? 'bg-masters-gold/20 text-masters-green-dark'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {rank}
                      </div>
                    </td>
                    <td class="px-4 py-3 font-semibold text-gray-900">{p.name}</td>
                    <td class="px-4 py-3 text-right text-gray-500 font-mono text-xs">{p.golfers.length}</td>
                    <td class="px-4 py-3 text-right text-gray-500 font-mono">{formatMoney(p.total_spent)}</td>
                    <td class="px-4 py-3 text-right font-mono money-positive">{formatMoney(p.total_winnings)}</td>
                    <td class={`px-4 py-3 text-right font-mono font-bold ${netClass(p.net)}`}>
                      {p.net >= 0 ? '+' : ''}{formatMoney(p.net)}
                    </td>
                    <td class="px-4 py-3 text-gray-400 text-xs">
                      {isExpanded ? '▲' : '▼'}
                    </td>
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
                                  <th class="px-2 py-1 text-center">Pos</th>
                                  <th class="px-2 py-1 text-center">Score</th>
                                  <th class="px-2 py-1 text-center">Thru</th>
                                  <th class="px-2 py-1 text-right">Cost</th>
                                  <th class="px-2 py-1 text-right">Won</th>
                                  <th class="px-2 py-1 text-right">Net</th>
                                </tr>
                              </thead>
                              <tbody>
                                {p.golfers.map((g) => {
                                  const golferKey = `${p.name}|||${g.name}`;
                                  const hasPays = g.payouts.length > 0;
                                  const isGolferExpanded = expandedGolfers.has(golferKey);
                                  const toggleGolfer = (e: Event) => {
                                    if (!hasPays) return;
                                    e.stopPropagation();
                                    setExpandedGolfers((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(golferKey)) next.delete(golferKey);
                                      else next.add(golferKey);
                                      return next;
                                    });
                                  };
                                  return (
                                    <>
                                      <tr
                                        key={g.name}
                                        class={`border-t border-gray-100 ${hasPays ? 'cursor-pointer' : ''} ${
                                          isGolferExpanded ? 'bg-green-50/40' : 'hover:bg-white'
                                        }`}
                                        onClick={toggleGolfer}
                                      >
                                        <td class="px-2 py-1.5">
                                          <div class="flex items-center gap-1.5">
                                            {hasPays && (
                                              <span class="text-[9px] text-green-600 w-3">{isGolferExpanded ? '▾' : '▸'}</span>
                                            )}
                                            <span class="font-medium text-gray-800">{g.name}</span>
                                            {g.made_cut === false && <span class="badge badge-missed text-[9px]">MC</span>}
                                            {g.status === 'WD' && <span class="badge badge-missed text-[9px]">WD</span>}
                                          </div>
                                        </td>
                                        <td class="px-2 py-1.5 text-center text-gray-500">{g.position || '-'}</td>
                                        <td class="px-2 py-1.5 text-center font-mono text-gray-600">{formatToPar(g.to_par)}</td>
                                        <td class="px-2 py-1.5 text-center text-gray-400">{g.thru || '-'}</td>
                                        <td class="px-2 py-1.5 text-right font-mono text-gray-500">{formatMoney(g.price)}</td>
                                        <td class="px-2 py-1.5 text-right font-mono money-positive">
                                          {g.won > 0 ? formatMoney(g.won) : '-'}
                                        </td>
                                        <td class={`px-2 py-1.5 text-right font-mono font-semibold ${netClass(g.net)}`}>
                                          {g.net >= 0 ? '+' : ''}{formatMoney(g.net)}
                                        </td>
                                      </tr>
                                      {isGolferExpanded && g.payouts.map((pay: GolferPayout, j: number) => (
                                        <tr key={`${g.name}-pay-${j}`} class="bg-green-50/60">
                                          <td colSpan={5} class="px-2 py-0.5 pl-8">
                                            <span class="text-[10px] text-green-700">{pay.type}</span>
                                          </td>
                                          <td colSpan={2} class="px-2 py-0.5 text-right">
                                            <span class="text-[10px] font-mono text-green-700">{formatMoney(pay.amount)}</span>
                                          </td>
                                        </tr>
                                      ))}
                                    </>
                                  );
                                })}
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
}
