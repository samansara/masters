-- Add unique constraint for golfer upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_scores_tournament_player ON golfer_scores(tournament_id, player_id);

-- Add unique constraint for stats upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_stats_tournament_golfer ON golfer_stats(tournament_id, golfer_score_id);
