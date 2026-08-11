-- Historical auction results (pre-computed, one row per golfer per year)
CREATE TABLE IF NOT EXISTS historical_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  player TEXT NOT NULL,
  bidder TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  cut REAL NOT NULL DEFAULT 0,
  low_am REAL NOT NULL DEFAULT 0,
  high_score REAL NOT NULL DEFAULT 0,
  stats REAL NOT NULL DEFAULT 0,
  sat REAL NOT NULL DEFAULT 0,
  sun REAL NOT NULL DEFAULT 0,
  payout REAL NOT NULL DEFAULT 0,
  net REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_historical_year ON historical_results(year);
CREATE INDEX IF NOT EXISTS idx_historical_bidder ON historical_results(bidder);
