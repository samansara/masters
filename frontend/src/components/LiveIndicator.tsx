import { useState, useEffect } from 'preact/hooks';

interface Props {
  connected: boolean;
  lastUpdated: string | null;
  onRefresh?: () => Promise<string | null>;
}

const UPDATE_INTERVAL_MIN = 15;

function parseUTC(dateStr: string): Date {
  // DB stores UTC without Z suffix — ensure it's parsed as UTC
  const normalized = dateStr.endsWith('Z') ? dateStr : dateStr.replace(' ', 'T') + 'Z';
  return new Date(normalized);
}

function formatTimeET(dateStr: string): string {
  const d = parseUTC(dateStr);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York',
  });
}

function getNextUpdateMin(dateStr: string): number {
  const then = parseUTC(dateStr).getTime();
  const nextUpdate = then + UPDATE_INTERVAL_MIN * 60000;
  const remaining = Math.ceil((nextUpdate - Date.now()) / 60000);
  return Math.max(0, remaining);
}

export function LiveIndicator({ connected, lastUpdated, onRefresh }: Props) {
  const [, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  // Re-render every 30s to keep "Next Update" countdown fresh
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  const nextMin = lastUpdated ? getNextUpdateMin(lastUpdated) : null;

  return (
    <div class="flex items-center gap-3 text-xs">
      {lastUpdated && (
        <div class="flex items-center gap-1.5 px-2 py-1 rounded bg-gray-100 text-gray-500">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Last Update: {formatTimeET(lastUpdated)} ET</span>
          {nextMin !== null && (
            <>
              <span class="text-gray-300">|</span>
              <span class="text-gray-400">
                {nextMin === 0 ? 'Updating soon...' : `Next update in ${nextMin} min`}
              </span>
            </>
          )}
        </div>
      )}
      {onRefresh && (
        <>
          <button
            onClick={async () => {
              setRefreshing(true);
              setRefreshMsg(null);
              try {
                const err = await onRefresh();
                if (err) {
                  setRefreshMsg(err);
                  setTimeout(() => setRefreshMsg(null), 5000);
                }
              } finally { setRefreshing(false); }
            }}
            disabled={refreshing}
            class="flex items-center gap-1 px-2 py-1 rounded bg-masters-green/10 text-masters-green hover:bg-masters-green/20 transition-colors disabled:opacity-50"
            title="Force data refresh"
          >
            <svg class={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
          {refreshMsg && (
            <span class="px-2 py-1 rounded bg-red-50 text-red-600 text-xs">
              {refreshMsg}
            </span>
          )}
        </>
      )}
      <div class="flex items-center gap-1.5">
        <span
          class={`inline-block w-2 h-2 rounded-full ${
            connected ? 'bg-green-500 animate-pulse' : 'bg-gray-300'
          }`}
        ></span>
        <span class={connected ? 'text-green-600' : 'text-gray-400'}>
          {connected ? 'Live' : 'Reconnecting...'}
        </span>
      </div>
    </div>
  );
}
