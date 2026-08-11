import { useState } from 'preact/hooks';

interface PayoutEntry {
  participant_name: string;
  payout_type: string;
  amount: number;
  golfer_name: string | null;
  description: string;
}

interface PayoutSummary {
  participant_name: string;
  total_spent: number;
  total_winnings: number;
  net: number;
}

interface PayoutData {
  entries: PayoutEntry[];
  summary: PayoutSummary[];
  tournament_status: string;
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

const PAYOUT_CATEGORIES = [
  { key: 'Sunday Top 10', label: 'Sunday Top 10', pct: '47%', collapsible: true },
  { key: 'Saturday Top 10', label: 'Saturday Top 10', pct: '20%', collapsible: true },
  { key: 'Making the Cut', label: 'Making the Cut', pct: '25%', collapsible: true },
  { key: 'Low Amateur', label: 'Low Amateur', pct: '1.2%', collapsible: false },
  { key: 'Pre-Cut High Total', label: 'Pre-Cut High Total', pct: '1.6%', collapsible: false },
  { key: 'Post-Cut Rd High', label: 'Post-Cut Rd High', pct: '1.6%', collapsible: false },
  { key: 'Best Putting', label: 'Best Putting', pct: '1.2%', collapsible: false },
  { key: 'Best Driving', label: 'Best Driving', pct: '1.2%', collapsible: false },
  { key: 'Best GIR', label: 'Best GIR', pct: '1.2%', collapsible: false },
];

const PAYOUT_SCHEDULE = [
  { category: 'Making the Cut', pct: '25%', detail: 'Split evenly among all who make the cut' },
  { category: 'Sunday Final Standings', pct: '47%', detail: '1st: 15%, 2nd: 7.5%, 3rd: 6%, 4th: 5%, 5th: 4%, 6th: 3%, 7th: 2.5%, 8th: 2%, 9th: 1%, 10th: 1%' },
  { category: 'Saturday Standings', pct: '20%', detail: '1st: 5%, 2nd: 3%, 3rd: 2%, 4th: 2%, 5th: 2%, 6th: 2%, 7th: 1%, 8th: 1%, 9th: 1%, 10th: 1%' },
  { category: 'Low Amateur', pct: '1.2%', detail: 'Lowest scoring amateur' },
  { category: 'Pre-Cut High Total', pct: '1.6%', detail: 'Highest 2-round total among missed cut players' },
  { category: 'Post-Cut Rd High', pct: '1.6%', detail: 'Highest single round score after the cut' },
  { category: 'Best Putting', pct: '1.2%', detail: 'Lowest average number of putts per green in regulation (cut makers only)' },
  { category: 'Best Driving Accuracy', pct: '1.2%', detail: 'Highest fairways in regulation % (cut makers only)' },
  { category: 'Best GIR', pct: '1.2%', detail: 'Highest greens in regulation % (cut makers only)' },
];

export function PayoutBreakdown({
  payouts,
  totalPot,
}: {
  payouts: PayoutData | null;
  totalPot: number;
}) {
  const [collapsedCards, setCollapsedCards] = useState<Set<string>>(
    new Set(['Making the Cut', 'Sunday Top 10', 'Saturday Top 10'])
  );
  const [scheduleOpen, setScheduleOpen] = useState(false);

  if (!payouts) {
    return (
      <div class="card p-8 text-center text-gray-500">
        <p class="text-lg font-medium">No payout data yet</p>
        <p class="text-sm mt-1">Payouts will be calculated as tournament data comes in.</p>
      </div>
    );
  }

  // Group entries by base category (strip " (Projected)" suffix for grouping)
  const grouped = new Map<string, PayoutEntry[]>();
  const projectedCategories = new Set<string>();
  for (const entry of payouts.entries) {
    const isProjected = entry.payout_type.includes('(Projected)');
    const baseKey = entry.payout_type.replace(' (Projected)', '');
    if (isProjected) projectedCategories.add(baseKey);
    if (!grouped.has(baseKey)) grouped.set(baseKey, []);
    grouped.get(baseKey)!.push(entry);
  }

  const isTop10 = (key: string) => key.includes('Top 10');

  // Extract position from description like "Golfer — Saturday position 2 (T2, 4-way tie)"
  function extractPosition(description: string): string | null {
    const match = description.match(/position\s+\d+\s*\(([^)]+)\)/);
    if (match) return match[1].split(',')[0].trim();
    const simple = description.match(/position\s+(\d+)/);
    if (simple) return simple[1];
    return null;
  }

  function toggleCard(key: string) {
    setCollapsedCards((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div class="space-y-6">
      {/* Payout Schedule Reference */}
      <div class="card">
        <div
          class="px-4 py-3 bg-masters-green text-white text-sm font-semibold flex items-center justify-between cursor-pointer"
          onClick={() => setScheduleOpen(!scheduleOpen)}
        >
          <span>Payout Schedule</span>
          <div class="flex items-center gap-2">
            {totalPot > 0 && (
              <span class="text-white/70 text-xs font-normal">
                Total Pot: {formatMoney(totalPot)}
              </span>
            )}
            <span class="text-white/60 text-xs">{scheduleOpen ? '▲' : '▼'}</span>
          </div>
        </div>
        {scheduleOpen && (
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-gray-200 text-xs uppercase text-gray-500">
                  <th class="px-4 py-2 text-left">Category</th>
                  <th class="px-4 py-2 text-right w-20">% of Pot</th>
                  {totalPot > 0 && <th class="px-4 py-2 text-right w-24">Amount</th>}
                  <th class="px-4 py-2 text-left">Details</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50">
                {PAYOUT_SCHEDULE.map((row) => (
                  <tr key={row.category} class="hover:bg-gray-50">
                    <td class="px-4 py-2 font-medium text-gray-800">{row.category}</td>
                    <td class="px-4 py-2 text-right font-mono text-gray-600">{row.pct}</td>
                    {totalPot > 0 && (
                      <td class="px-4 py-2 text-right font-mono text-gray-600">
                        {formatMoney(totalPot * parseFloat(row.pct) / 100)}
                      </td>
                    )}
                    <td class="px-4 py-2 text-xs text-gray-500">{row.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Collapsible Categories (full-width) */}
      <div class="space-y-4">
        {PAYOUT_CATEGORIES.filter((c) => c.collapsible).map((cat) => {
          const entries = grouped.get(cat.key) || [];
          const isProjected = projectedCategories.has(cat.key);
          const showPosition = isTop10(cat.key);
          const isCollapsed = collapsedCards.has(cat.key);

          return (
            <div key={cat.key} class="card">
              <div
                class={`px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between ${
                  cat.collapsible ? 'cursor-pointer' : ''
                }`}
                onClick={cat.collapsible ? () => toggleCard(cat.key) : undefined}
              >
                <div class="flex items-center gap-2">
                  {cat.collapsible && (
                    <span class="text-xs text-gray-400">{isCollapsed ? '▶' : '▼'}</span>
                  )}
                  <span class="font-semibold text-sm text-gray-800">{cat.label}</span>
                  <span class="text-xs text-gray-400">({cat.pct} of pot)</span>
                  {isProjected && (
                    <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                      PROJECTED
                    </span>
                  )}
                  {entries.length > 0 && (cat.key === 'Making the Cut' || isCollapsed) && (
                    <span class="text-xs text-gray-400">{entries.length} golfer{entries.length !== 1 ? 's' : ''}</span>
                  )}
                </div>
                {totalPot > 0 && (
                  <span class="text-xs font-mono text-gray-500">
                    {formatMoney(totalPot * parseFloat(cat.pct) / 100)} available
                  </span>
                )}
              </div>
              {!isCollapsed && (
                <div class="px-4 py-2">
                  {entries.length === 0 ? (
                    <p class="text-xs text-gray-400 py-1">Not yet determined</p>
                  ) : (
                    <div class="space-y-1">
                      {entries.map((e, j) => {
                        const pos = showPosition && e.description ? extractPosition(e.description) : null;
                        return (
                          <div
                            key={`${e.golfer_name}-${j}`}
                            class="flex items-center justify-between text-sm py-1"
                          >
                            <div class="flex-1 min-w-0 flex items-center gap-2">
                              {pos && (
                                <span class="text-xs font-mono text-gray-400 w-6 text-right shrink-0">{pos}</span>
                              )}
                              <span class="font-medium text-gray-700">{e.golfer_name || e.participant_name}</span>
                              <span class="text-gray-400 text-xs">({e.participant_name})</span>
                            </div>
                            <span class="money-positive font-mono text-sm ml-2">
                              {formatMoney(e.amount)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Non-collapsible Categories (grid) */}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {PAYOUT_CATEGORIES.filter((c) => !c.collapsible).map((cat) => {
          const entries = grouped.get(cat.key) || [];
          const isProjected = projectedCategories.has(cat.key);
          const showPosition = isTop10(cat.key);

          return (
            <div key={cat.key} class="card">
              <div class="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="font-semibold text-sm text-gray-800">{cat.label}</span>
                  <span class="text-xs text-gray-400">({cat.pct} of pot)</span>
                  {isProjected && (
                    <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                      PROJECTED
                    </span>
                  )}
                </div>
                {totalPot > 0 && (
                  <span class="text-xs font-mono text-gray-500">
                    {formatMoney(totalPot * parseFloat(cat.pct) / 100)} available
                  </span>
                )}
              </div>
              <div class="px-4 py-2">
                {entries.length === 0 ? (
                  <p class="text-xs text-gray-400 py-1">Not yet determined</p>
                ) : (
                  <div class="space-y-1">
                    {entries.map((e, j) => {
                      const pos = showPosition && e.description ? extractPosition(e.description) : null;
                      return (
                        <div
                          key={`${e.golfer_name}-${j}`}
                          class="flex items-center justify-between text-sm py-1"
                        >
                          <div class="flex-1 min-w-0 flex items-center gap-2">
                            {pos && (
                              <span class="text-xs font-mono text-gray-400 w-6 text-right shrink-0">{pos}</span>
                            )}
                            <span class="font-medium text-gray-700">{e.golfer_name || e.participant_name}</span>
                            <span class="text-gray-400 text-xs">({e.participant_name})</span>
                          </div>
                          <span class="money-positive font-mono text-sm ml-2">
                            {formatMoney(e.amount)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
