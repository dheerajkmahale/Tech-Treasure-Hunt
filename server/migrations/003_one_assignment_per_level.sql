ALTER TABLE team_challenges ADD COLUMN IF NOT EXISTS level SMALLINT;
UPDATE team_challenges tc SET level=c.level FROM challenges c WHERE tc.challenge_id=c.id AND tc.level IS NULL;
-- If an earlier development database assigned more than one challenge for a level,
-- keep the earliest assignment for each team/level before adding the invariant.
WITH duplicates AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY team_id, level ORDER BY assigned_at, id) AS position
  FROM team_challenges
)
DELETE FROM team_challenges WHERE id IN (SELECT id FROM duplicates WHERE position > 1);
ALTER TABLE team_challenges ALTER COLUMN level SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_challenges_team_level ON team_challenges(team_id, level);
