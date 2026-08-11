import { useState } from 'preact/hooks';

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map((v) => v.trim());
    if (vals.length < headers.length) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = vals[j] || '';
    });
    rows.push(row);
  }

  return { headers, rows };
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function Admin() {
  const [activeSection, setActiveSection] = useState<'auction' | 'historical'>('auction');

  return (
    <div class="space-y-6">
      <div class="flex gap-4 border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveSection('auction')}
          class={`pb-3 px-1 text-sm font-medium transition-colors ${
            activeSection === 'auction' ? 'tab-active' : 'tab-inactive'
          }`}
        >
          Upload Auction
        </button>
        <button
          onClick={() => setActiveSection('historical')}
          class={`pb-3 px-1 text-sm font-medium transition-colors ${
            activeSection === 'historical' ? 'tab-active' : 'tab-inactive'
          }`}
        >
          Upload Historical
        </button>
      </div>

      {activeSection === 'auction' && <AuctionUpload />}
      {activeSection === 'historical' && <HistoricalUpload />}
    </div>
  );
}

function AuctionUpload() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [pot, setPot] = useState(0);
  const [cutLine, setCutLine] = useState(50);
  const [preview, setPreview] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  function handleFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const parsed = parseCSV(text);
      if (parsed.rows.length === 0) {
        setStatus({ type: 'error', message: 'Could not parse CSV. Ensure it has headers: participant, golfer, price' });
        return;
      }
      setPreview(parsed);
      setStatus(null);
    };
    reader.readAsText(file);
  }

  async function upload() {
    if (!preview || preview.rows.length === 0) return;
    setUploading(true);
    setStatus(null);

    try {
      // Ensure tournament exists
      const tRes = await fetch('/api/admin/tournament', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, total_pot: pot, cut_line: cutLine }),
      });
      let tournamentId: number;

      if (tRes.ok) {
        const tData = await tRes.json() as any;
        tournamentId = tData.id;
      } else {
        // Tournament might already exist — try to get active
        const activeRes = await fetch('/api/tournament');
        if (!activeRes.ok) throw new Error('Could not create or find tournament');
        const activeData = await activeRes.json() as any;
        tournamentId = activeData.id;
      }

      // Map CSV columns to expected format
      const purchases = preview.rows.map((r) => ({
        participant: r.participant || r.bidder || r.buyer || '',
        golfer: r.golfer || r.player || '',
        price: parseFloat(r.price || r.cost || '0'),
      })).filter((p) => p.participant && p.golfer);

      const res = await fetch('/api/admin/upload-auction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournament_id: tournamentId, purchases }),
      });

      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json() as any;
      setStatus({ type: 'success', message: `Uploaded ${data.count} auction purchases for ${year}` });
      setPreview(null);
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Upload failed' });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div class="space-y-4">
      <div class="card p-6">
        <h3 class="text-lg font-semibold text-gray-800 mb-4">Upload Current Auction</h3>
        <p class="text-sm text-gray-500 mb-4">
          CSV with columns: <code class="bg-gray-100 px-1 rounded text-xs">participant, golfer, price</code>
        </p>

        <div class="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Year</label>
            <input
              type="number"
              value={year}
              onInput={(e) => setYear(parseInt((e.target as HTMLInputElement).value))}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Total Pot ($)</label>
            <input
              type="number"
              value={pot}
              onInput={(e) => setPot(parseFloat((e.target as HTMLInputElement).value))}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Cut Line (+ ties)</label>
            <input
              type="number"
              value={cutLine}
              onInput={(e) => setCutLine(parseInt((e.target as HTMLInputElement).value) || 50)}
              placeholder="50"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>

        <input
          type="file"
          accept=".csv"
          onChange={handleFile}
          class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-masters-green file:text-white hover:file:bg-masters-green-dark file:cursor-pointer"
        />
      </div>

      {status && (
        <div class={`p-3 rounded-lg text-sm ${
          status.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {status.message}
        </div>
      )}

      {preview && (
        <div class="card">
          <div class="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <span class="text-sm font-semibold text-gray-700">Preview — {preview.rows.length} rows</span>
            <button
              onClick={upload}
              disabled={uploading}
              class="px-4 py-1.5 bg-masters-green text-white text-sm font-semibold rounded-lg hover:bg-masters-green-dark disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Confirm Upload'}
            </button>
          </div>
          <div class="overflow-x-auto max-h-96">
            <table class="w-full text-xs">
              <thead>
                <tr class="border-b border-gray-200 text-[10px] uppercase text-gray-500">
                  {preview.headers.map((h) => (
                    <th key={h} class="px-3 py-2 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50">
                {preview.rows.slice(0, 50).map((row, i) => (
                  <tr key={i} class="hover:bg-gray-50">
                    {preview.headers.map((h) => (
                      <td key={h} class="px-3 py-1.5 text-gray-700">{row[h]}</td>
                    ))}
                  </tr>
                ))}
                {preview.rows.length > 50 && (
                  <tr><td colSpan={preview.headers.length} class="px-3 py-2 text-center text-gray-400">
                    ... and {preview.rows.length - 50} more rows
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function HistoricalUpload() {
  const [preview, setPreview] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [detectedYear, setDetectedYear] = useState<number | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  const EXPECTED_COLUMNS = ['year', 'player', 'bidder', 'price', 'cut', 'low_am', 'high_score', 'stats', 'sat', 'sun', 'payout', 'net'];

  function handleFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const parsed = parseCSV(text);
      if (parsed.rows.length === 0) {
        setStatus({ type: 'error', message: 'Could not parse CSV.' });
        return;
      }

      // Check for expected columns
      const missing = EXPECTED_COLUMNS.filter((c) => !parsed.headers.includes(c));
      if (missing.length > 0) {
        setStatus({ type: 'error', message: `Missing columns: ${missing.join(', ')}. Expected: ${EXPECTED_COLUMNS.join(', ')}` });
        return;
      }

      // Detect year from first row
      const yr = parseInt(parsed.rows[0].year);
      setDetectedYear(yr || null);
      setPreview(parsed);
      setStatus(null);
    };
    reader.readAsText(file);
  }

  async function upload() {
    if (!preview || !detectedYear) return;
    setUploading(true);
    setStatus(null);

    try {
      const res = await fetch('/api/admin/upload-historical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: detectedYear, rows: preview.rows }),
      });

      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json() as any;
      setStatus({ type: 'success', message: `Uploaded ${data.count} rows for ${data.year}` });
      setPreview(null);
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Upload failed' });
    } finally {
      setUploading(false);
    }
  }

  // Compute bidder summary from preview
  const bidderSummary = preview ? (() => {
    const map = new Map<string, { spent: number; payout: number; net: number; count: number }>();
    for (const r of preview.rows) {
      const bidder = r.bidder || '';
      if (!map.has(bidder)) map.set(bidder, { spent: 0, payout: 0, net: 0, count: 0 });
      const p = map.get(bidder)!;
      p.spent += parseFloat(r.price) || 0;
      p.payout += parseFloat(r.payout) || 0;
      p.net += parseFloat(r.net) || 0;
      p.count++;
    }
    return [...map.entries()]
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.net - a.net);
  })() : [];

  return (
    <div class="space-y-4">
      <div class="card p-6">
        <h3 class="text-lg font-semibold text-gray-800 mb-4">Upload Historical Results</h3>
        <p class="text-sm text-gray-500 mb-4">
          CSV with columns: <code class="bg-gray-100 px-1 rounded text-xs">{EXPECTED_COLUMNS.join(', ')}</code>
        </p>

        <input
          type="file"
          accept=".csv"
          onChange={handleFile}
          class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-masters-green file:text-white hover:file:bg-masters-green-dark file:cursor-pointer"
        />
      </div>

      {status && (
        <div class={`p-3 rounded-lg text-sm ${
          status.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {status.message}
        </div>
      )}

      {preview && (
        <>
          {/* Bidder Summary */}
          <div class="card">
            <div class="px-4 py-3 bg-masters-green text-white text-sm font-semibold flex items-center justify-between">
              <span>Year {detectedYear} — Participant Summary</span>
              <button
                onClick={upload}
                disabled={uploading}
                class="px-4 py-1.5 bg-white text-masters-green text-sm font-semibold rounded-lg hover:bg-gray-100 disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : `Upload ${preview.rows.length} rows`}
              </button>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-gray-200 text-xs uppercase text-gray-500">
                    <th class="px-4 py-2 text-left">#</th>
                    <th class="px-4 py-2 text-left">Bidder</th>
                    <th class="px-4 py-2 text-right">Golfers</th>
                    <th class="px-4 py-2 text-right">Spent</th>
                    <th class="px-4 py-2 text-right">Payout</th>
                    <th class="px-4 py-2 text-right">Net</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-50">
                  {bidderSummary.map((b, i) => (
                    <tr key={b.name} class="hover:bg-gray-50">
                      <td class="px-4 py-2 text-gray-400 font-mono text-xs">{i + 1}</td>
                      <td class="px-4 py-2 font-medium">{b.name}</td>
                      <td class="px-4 py-2 text-right text-gray-500 font-mono">{b.count}</td>
                      <td class="px-4 py-2 text-right text-gray-500 font-mono">{formatMoney(b.spent)}</td>
                      <td class="px-4 py-2 text-right font-mono money-positive">{formatMoney(b.payout)}</td>
                      <td class={`px-4 py-2 text-right font-mono font-bold ${b.net >= 0 ? 'money-positive' : 'money-negative'}`}>
                        {b.net >= 0 ? '+' : ''}{formatMoney(b.net)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Raw Row Preview */}
          <div class="card">
            <div class="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <span class="text-sm font-semibold text-gray-700">Raw Data — {preview.rows.length} golfers</span>
            </div>
            <div class="overflow-x-auto max-h-80">
              <table class="w-full text-xs">
                <thead>
                  <tr class="border-b border-gray-200 text-[10px] uppercase text-gray-500">
                    {EXPECTED_COLUMNS.map((h) => (
                      <th key={h} class="px-3 py-2 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-50">
                  {preview.rows.slice(0, 30).map((row, i) => (
                    <tr key={i} class="hover:bg-gray-50">
                      {EXPECTED_COLUMNS.map((h) => (
                        <td key={h} class="px-3 py-1.5 text-gray-700">{row[h] || '-'}</td>
                      ))}
                    </tr>
                  ))}
                  {preview.rows.length > 30 && (
                    <tr><td colSpan={EXPECTED_COLUMNS.length} class="px-3 py-2 text-center text-gray-400">
                      ... and {preview.rows.length - 30} more rows
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
