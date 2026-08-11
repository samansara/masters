-- Replace old stats columns with correct ones from Masters.com feeds
-- driving_accuracy (from fir.json), putts_per_round (from putts.json), gir_pct (already exists from gir.json)
ALTER TABLE golfer_stats ADD COLUMN driving_accuracy REAL;
ALTER TABLE golfer_stats ADD COLUMN putts_per_round REAL;

-- Add projected_cut to golfer_scores for pre-R2 projections
ALTER TABLE golfer_scores ADD COLUMN projected_cut INTEGER;
