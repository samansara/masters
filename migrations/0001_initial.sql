-- Tournament configuration
CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT 'The Masters',
  total_pot REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Auction purchases (uploaded via CSV)
CREATE TABLE IF NOT EXISTS auction_purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  participant_name TEXT NOT NULL,
  golfer_name TEXT NOT NULL,
  purchase_price REAL NOT NULL,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
);

-- Live golfer scores (updated every poll)
CREATE TABLE IF NOT EXISTS golfer_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  player_id TEXT,
  name TEXT NOT NULL,
  is_amateur INTEGER NOT NULL DEFAULT 0,
  r1_score INTEGER,
  r2_score INTEGER,
  r3_score INTEGER,
  r4_score INTEGER,
  total_score INTEGER,
  to_par INTEGER,
  position TEXT,
  made_cut INTEGER,
  thru TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
);

-- Golfer statistics
CREATE TABLE IF NOT EXISTS golfer_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  golfer_score_id INTEGER NOT NULL,
  putting_avg REAL,
  driving_distance REAL,
  gir_pct REAL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
  FOREIGN KEY (golfer_score_id) REFERENCES golfer_scores(id)
);

-- Calculated payouts (latest snapshot)
CREATE TABLE IF NOT EXISTS payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  participant_name TEXT NOT NULL,
  payout_type TEXT NOT NULL,
  amount REAL NOT NULL,
  golfer_name TEXT,
  description TEXT,
  is_final INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_purchases_tournament ON auction_purchases(tournament_id);
CREATE INDEX IF NOT EXISTS idx_purchases_participant ON auction_purchases(participant_name);
CREATE INDEX IF NOT EXISTS idx_scores_tournament ON golfer_scores(tournament_id);
CREATE INDEX IF NOT EXISTS idx_scores_name ON golfer_scores(name);
CREATE INDEX IF NOT EXISTS idx_payouts_tournament ON payouts(tournament_id);
CREATE INDEX IF NOT EXISTS idx_payouts_participant ON payouts(participant_name);
