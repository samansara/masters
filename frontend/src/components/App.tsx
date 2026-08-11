import { useState, useEffect, useCallback } from 'preact/hooks';
import { Leaderboard } from './Leaderboard';
import { Participants } from './Participants';
import { PayoutBreakdown } from './PayoutBreakdown';
import { History } from './History';
import { LiveIndicator } from './LiveIndicator';

type Tab = 'standings' | 'participants' | 'payouts' | 'history';

interface TournamentInfo {
  id: number;
  year: number;
  name?: string;
  total_pot?: number;
  status: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('standings');
  const [tournament, setTournament] = useState<TournamentInfo | null>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [cutInfo, setCutInfo] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [lbRes, partRes, payRes] = await Promise.all([
        fetch('/api/leaderboard'),
        fetch('/api/participants'),
        fetch('/api/payouts'),
      ]);

      if (lbRes.ok) {
        const lbData = await lbRes.json();
        setLeaderboard(lbData.leaderboard || []);
        setCutInfo(lbData.cut_info || null);
        setTournament(lbData.tournament || null);
        setLastUpdated(lbData.last_updated || null);
      }
      if (partRes.ok) {
        const partData = await partRes.json();
        setParticipants(partData.participants || []);
        if (partData.tournament) {
          setTournament(partData.tournament);
        }
      }
      if (payRes.ok) {
        const payData = await payRes.json();
        setPayouts(payData);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch('/api/admin/trigger-ingest', { method: 'POST' });
      if (!res.ok) {
        const text = await res.text();
        return text || `Error ${res.status}`;
      }
      // Wait briefly for ingest + payout queue to process
      await new Promise((r) => setTimeout(r, 3000));
      await fetchData();
      return null;
    } catch (err) {
      console.error('Manual refresh failed:', err);
      return 'Refresh failed';
    }
  }, [fetchData]);

  // Initial data fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // WebSocket for live updates
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${protocol}//${location.host}/api/ws`);

      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => {
        setWsConnected(false);
        reconnectTimer = setTimeout(connect, 5000);
      };
      ws.onerror = () => ws?.close();
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'update') {
            fetchData();
          }
        } catch {}
      };
    }

    connect();

    // Keepalive ping
    const pingInterval = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send('ping');
      }
    }, 30000);

    // Fallback polling every 60s
    const pollInterval = setInterval(fetchData, 60000);

    return () => {
      ws?.close();
      clearTimeout(reconnectTimer);
      clearInterval(pingInterval);
      clearInterval(pollInterval);
    };
  }, [fetchData]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'standings', label: 'Standings' },
    { id: 'participants', label: 'Participants' },
    { id: 'payouts', label: 'Payouts' },
    { id: 'history', label: 'Past Auctions' },
  ];

  return (
    <div>
      {/* Tournament Info Bar */}
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <div>
          {tournament && (
            <div class="flex items-center gap-3">
              <h2 class="text-xl font-bold text-masters-green">
                {tournament.name || 'The Masters'} {tournament.year}
              </h2>
              {tournament.total_pot && (
                <span class="badge bg-masters-gold/20 text-masters-green-dark font-semibold">
                  Pot: ${tournament.total_pot.toLocaleString()}
                </span>
              )}
            </div>
          )}
        </div>
        <LiveIndicator connected={wsConnected} lastUpdated={lastUpdated} onRefresh={handleRefresh} />
      </div>

      {/* Tabs */}
      <div class="border-b border-gray-200 mb-6">
        <nav class="flex gap-6" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              class={`pb-3 px-1 text-sm font-medium transition-colors ${
                activeTab === tab.id ? 'tab-active' : 'tab-inactive'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      {loading ? (
        <div class="flex items-center justify-center py-20">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-masters-green"></div>
          <span class="ml-3 text-gray-500">Loading tournament data...</span>
        </div>
      ) : (
        <>
          {activeTab === 'standings' && <Leaderboard entries={leaderboard} payouts={payouts?.entries} cutInfo={cutInfo} />}
          {activeTab === 'participants' && (
            <Participants participants={participants} totalPot={tournament?.total_pot || 0} />
          )}
          {activeTab === 'payouts' && <PayoutBreakdown payouts={payouts} totalPot={tournament?.total_pot || 0} />}
          {activeTab === 'history' && <History />}
        </>
      )}
    </div>
  );
}
