-- Remove the old demo question content and assignments, while preserving player accounts,
-- organizer accounts, and leaderboard/team records. The new bank is imported explicitly.
DELETE FROM team_challenges;
DELETE FROM challenges;
