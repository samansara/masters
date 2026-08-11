-- Add configurable cut line per tournament (default 50 for Masters, 65 for Players, etc.)
ALTER TABLE tournaments ADD COLUMN cut_line INTEGER NOT NULL DEFAULT 50;
