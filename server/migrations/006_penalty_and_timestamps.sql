-- Wrong-answer penalty (60 seconds each). Stored separately from real elapsed time
-- so total time = elapsed + penalty can always be recalculated accurately.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS penalty_seconds INTEGER NOT NULL DEFAULT 0 CHECK (penalty_seconds >= 0);
ALTER TABLE teams ADD COLUMN IF NOT EXISTS wrong_answers INTEGER NOT NULL DEFAULT 0 CHECK (wrong_answers >= 0);
