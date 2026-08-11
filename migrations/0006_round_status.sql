-- Store ESPN round status on the tournament for consistent use across ingestion and payouts
ALTER TABLE tournaments ADD COLUMN current_round INTEGER DEFAULT NULL;
ALTER TABLE tournaments ADD COLUMN round_state TEXT DEFAULT NULL;
ALTER TABLE tournaments ADD COLUMN round_detail TEXT DEFAULT NULL;
ALTER TABLE tournaments ADD COLUMN espn_cut_score INTEGER DEFAULT NULL;
ALTER TABLE tournaments ADD COLUMN espn_cut_count INTEGER DEFAULT NULL;
