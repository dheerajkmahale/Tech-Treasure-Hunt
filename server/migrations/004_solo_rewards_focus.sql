ALTER TABLE teams ADD COLUMN IF NOT EXISTS coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0);
ALTER TABLE teams ADD COLUMN IF NOT EXISTS gems INTEGER NOT NULL DEFAULT 0 CHECK (gems >= 0);
ALTER TABLE teams ADD COLUMN IF NOT EXISTS current_question SMALLINT NOT NULL DEFAULT 1 CHECK (current_question BETWEEN 1 AND 8);
ALTER TABLE teams ADD COLUMN IF NOT EXISTS focus_violations INTEGER NOT NULL DEFAULT 0 CHECK (focus_violations >= 0);
ALTER TABLE teams ADD COLUMN IF NOT EXISTS terminated_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS focus_events (
  id BIGSERIAL PRIMARY KEY,
  team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(40) NOT NULL CHECK (event_type IN ('fullscreen_exit','tab_hidden','window_blur')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  client_event_id VARCHAR(100),
  UNIQUE(user_id, client_event_id)
);
CREATE INDEX IF NOT EXISTS idx_focus_events_team_time ON focus_events(team_id, occurred_at DESC);
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_status_check;
ALTER TABLE teams ADD CONSTRAINT teams_status_check CHECK (status IN ('lobby','in_progress','completed','paused','terminated'));
