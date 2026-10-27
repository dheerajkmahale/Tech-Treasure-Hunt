CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'player' CHECK (role IN ('player','organizer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS classrooms (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS teams (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  join_code VARCHAR(20) NOT NULL UNIQUE,
  leader_id BIGINT NOT NULL REFERENCES users(id),
  classroom_id BIGINT REFERENCES classrooms(id),
  current_level SMALLINT NOT NULL DEFAULT 1 CHECK (current_level BETWEEN 1 AND 5),
  status VARCHAR(20) NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby','in_progress','completed','paused')),
  game_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS team_members (
  team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(team_id, user_id)
);
CREATE TABLE IF NOT EXISTS characters (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  character_name VARCHAR(24) NOT NULL,
  archetype VARCHAR(40) NOT NULL,
  appearance JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS challenges (
  id BIGSERIAL PRIMARY KEY,
  level SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 5),
  slug VARCHAR(100) NOT NULL UNIQUE,
  title VARCHAR(160) NOT NULL,
  challenge_type VARCHAR(30) NOT NULL,
  public_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  private_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  difficulty VARCHAR(20) NOT NULL DEFAULT 'normal'
);
CREATE TABLE IF NOT EXISTS team_challenges (
  id BIGSERIAL PRIMARY KEY,
  team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  challenge_id BIGINT NOT NULL REFERENCES challenges(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  UNIQUE(team_id, challenge_id)
);
CREATE TABLE IF NOT EXISTS challenge_submissions (
  id BIGSERIAL PRIMARY KEY,
  team_challenge_id BIGINT NOT NULL REFERENCES team_challenges(id) ON DELETE CASCADE,
  submitted_by BIGINT REFERENCES users(id),
  submission JSONB NOT NULL,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  passed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ai_evaluations (
  id BIGSERIAL PRIMARY KEY,
  submission_id BIGINT NOT NULL REFERENCES challenge_submissions(id) ON DELETE CASCADE,
  model VARCHAR(100) NOT NULL,
  rubric_scores JSONB NOT NULL,
  weighted_score NUMERIC(5,2) NOT NULL,
  feedback TEXT NOT NULL,
  fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS game_events (
  id BIGSERIAL PRIMARY KEY,
  event_name VARCHAR(120) NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 70,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','paused','ended')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id BIGINT REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(50),
  target_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_teams_status ON teams(status);
CREATE INDEX IF NOT EXISTS idx_team_challenges_team ON team_challenges(team_id);
CREATE INDEX IF NOT EXISTS idx_submissions_created ON challenge_submissions(created_at DESC);
