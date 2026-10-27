import crypto from 'node:crypto';
import { pool } from '../db/pool.js';
import { challengeBank, LEVELS } from './challenges.js';

const TEAM_LIMIT = Number(process.env.MAX_TEAMS || 20);
const EXPECTED_QUESTION_COUNTS = [5, 5, 5, 5, 5];
const WRONG_ANSWER_PENALTY_SECONDS = 60;
const questionBankIsReady = (rows) => rows.length === 5 && rows.every((r, i) => Number(r.level) === i + 1 && Number(r.question_count) === EXPECTED_QUESTION_COUNTS[i]);
const TEAM_SIZE = Number(process.env.MAX_TEAM_SIZE || 5);
const COINS_PER_CORRECT_ANSWER = Math.max(0, Number(process.env.COINS_PER_CORRECT_ANSWER || 10));
const LEVEL_COMPLETION_BONUS = Math.max(0, Number(process.env.LEVEL_COMPLETION_BONUS || 25));
const GEMS_PER_LEVEL = Math.max(0, Number(process.env.GEMS_PER_LEVEL || 1));
const clean = (v) => String(v ?? '').trim();
const normalizeCode = (s) => clean(s).replace(/\s+/g, ' ').replace(/\s*([{}();,+=])\s*/g, '$1').toLowerCase();

export async function seedChallenges(client = pool) {
  // Remove stale, uncompleted assignments to retired Level 4/5 challenge variants.
  // Completed historical submissions remain untouched.
  await client.query(`DELETE FROM team_challenges tc USING challenges c
    WHERE tc.challenge_id=c.id AND c.level IN (4,5) AND tc.completed_at IS NULL
      AND c.slug NOT IN ('oracle-green-01','oracle-cyber-02','algorithm-binary-search-01')`);
  for (const c of challengeBank) {
    await client.query(`INSERT INTO challenges(level, slug, title, challenge_type, public_payload, private_payload, difficulty)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, public_payload=EXCLUDED.public_payload, private_payload=EXCLUDED.private_payload, difficulty=EXCLUDED.difficulty`,
      [c.level, c.slug, c.title, c.challenge_type, JSON.stringify(c.public_payload), JSON.stringify(c.private_payload), c.difficulty]);
  }
}

async function assignChallenge(client, teamId, level) {
  const existing = await client.query(`SELECT tc.id, c.id AS challenge_id, c.level, c.slug, c.title, c.challenge_type, c.public_payload, tc.started_at, tc.completed_at
    FROM team_challenges tc JOIN challenges c ON c.id=tc.challenge_id WHERE tc.team_id=$1 AND tc.level=$2 LIMIT 1`, [teamId, level]);
  if (existing.rowCount) return existing.rows[0];
  const choices = await client.query('SELECT id FROM challenges WHERE level=$1 ORDER BY random() LIMIT 1', [level]);
  if (!choices.rowCount) throw Object.assign(new Error(`No challenge seeded for level ${level}`), { status: 500 });
  await client.query('INSERT INTO team_challenges(team_id, challenge_id, level, started_at) VALUES ($1,$2,$3,NOW()) ON CONFLICT (team_id, level) DO NOTHING', [teamId, choices.rows[0].id, level]);
  const result = await client.query(`SELECT tc.id, c.id AS challenge_id, c.level, c.slug, c.title, c.challenge_type, c.public_payload, tc.started_at, tc.completed_at
    FROM team_challenges tc JOIN challenges c ON c.id=tc.challenge_id WHERE tc.team_id=$1 AND tc.level=$2`, [teamId, level]);
  return result.rows[0];
}

export async function getTeamForUser(userId) {
  const r = await pool.query(`SELECT t.*, tm.joined_at, (t.leader_id=$1) AS is_leader, c.name AS classroom_name
    FROM team_members tm JOIN teams t ON t.id=tm.team_id LEFT JOIN classrooms c ON c.id=t.classroom_id WHERE tm.user_id=$1`, [userId]);
  return r.rows[0] || null;
}

export async function getGameState(userId) {
  const team = await getTeamForUser(userId);
  if (!team) { const r = await pool.query(`SELECT level, jsonb_array_length(public_payload->'questions') AS question_count FROM challenges WHERE challenge_type='multiple_choice' ORDER BY level`); const questionBankReady = questionBankIsReady(r.rows); return { team: null, levels: LEVELS.map(x => ({ ...x, status: 'locked' })), currentChallenge: null, questionBankReady }; }
  const members = await pool.query(`SELECT u.id, u.full_name, u.email, ch.character_name, ch.archetype, ch.appearance
    FROM team_members tm JOIN users u ON u.id=tm.user_id LEFT JOIN characters ch ON ch.user_id=u.id WHERE tm.team_id=$1 ORDER BY tm.joined_at`, [team.id]);
  const assignmentCount = await pool.query('SELECT COUNT(*)::int AS count FROM team_challenges WHERE team_id=$1', [team.id]);
  const hasAssignments = Number(assignmentCount.rows[0].count) > 0;
  const effectiveStatus = hasAssignments ? team.status : 'lobby';
  const effectiveLevel = hasAssignments ? Number(team.current_level) : 1;
  const completed = await pool.query(`SELECT c.level, tc.completed_at FROM team_challenges tc JOIN challenges c ON c.id=tc.challenge_id WHERE tc.team_id=$1 AND tc.completed_at IS NOT NULL ORDER BY c.level`, [team.id]);
  let currentChallenge = null;
  if (hasAssignments && team.status === 'in_progress' && effectiveLevel <= 5) {
    const ready = await pool.query('SELECT id FROM challenges WHERE level=$1 LIMIT 1', [effectiveLevel]);
    if (ready.rowCount) currentChallenge = await assignChallenge(pool, team.id, effectiveLevel);
  }
  const levels = LEVELS.map((l) => ({
    ...l,
    status: !hasAssignments ? 'locked' : completed.rows.some(x => Number(x.level) === l.level) ? 'completed' :
      (team.status === 'in_progress' && effectiveLevel === l.level ? 'active' : (l.level < effectiveLevel ? 'completed' : 'locked'))
  }));
  let solvedQuestionIds = [];
  if (currentChallenge) { const solved = await pool.query(`SELECT DISTINCT submission->>'questionId' AS question_id FROM challenge_submissions WHERE team_challenge_id=$1 AND passed=TRUE`, [currentChallenge.id]); solvedQuestionIds = solved.rows.map(x => x.question_id); }
  const readiness = await pool.query(`SELECT level, jsonb_array_length(public_payload->'questions') AS question_count FROM challenges WHERE challenge_type='multiple_choice' ORDER BY level`);
  const questionBankReady = questionBankIsReady(readiness.rows);
  const visibleChallenge = currentChallenge ? publicChallenge(currentChallenge) : null;
  if (visibleChallenge?.payload?.questions) {
    visibleChallenge.payload.questions = visibleChallenge.payload.questions.filter(q => !solvedQuestionIds.includes(String(q.id))).slice(0, 1);
  }
  return { team: { id: team.id, name: team.name, joinCode: team.join_code, leaderId: team.leader_id, isLeader: team.is_leader, classroom: team.classroom_name, currentLevel: effectiveLevel, status: effectiveStatus, gameStartedAt: hasAssignments ? team.game_started_at : null, completedAt: hasAssignments ? team.completed_at : null, coins: hasAssignments ? (team.coins || 0) : 0, gems: hasAssignments ? (team.gems || 0) : 0, currentQuestion: hasAssignments ? (team.current_question || 1) : 1, focusViolations: hasAssignments ? (team.focus_violations || 0) : 0, penaltySeconds: hasAssignments ? (team.penalty_seconds || 0) : 0, wrongAnswers: hasAssignments ? (team.wrong_answers || 0) : 0, members: members.rows }, levels, currentChallenge: visibleChallenge, questionBankReady, solvedQuestionIds };
}
function publicChallenge(c) { return { assignmentId: c.id, challengeId: c.challenge_id, level: c.level, slug: c.slug, title: c.title, type: c.challenge_type, payload: c.public_payload, startedAt: c.started_at, completedAt: c.completed_at }; }

export async function startGame(userId) {
  const readiness = await pool.query(`SELECT level, jsonb_array_length(public_payload->'questions') AS question_count FROM challenges WHERE challenge_type='multiple_choice' ORDER BY level`);
  const ready = questionBankIsReady(readiness.rows);
  if (!ready) throw Object.assign(new Error('The question bank is not ready yet. The supplied question bank must be imported before the game can start.'), { status: 409, code: 'QUESTION_BANK_EMPTY' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let membership = await client.query(`SELECT t.*, (SELECT COUNT(*)::int FROM team_members x WHERE x.team_id=t.id) AS member_count
      FROM teams t JOIN team_members tm ON tm.team_id=t.id WHERE tm.user_id=$1 FOR UPDATE OF t`, [userId]);
    // Legacy multi-player teams are split as each player begins the new individual edition.
    if (membership.rowCount && Number(membership.rows[0].member_count) > 1) {
      await client.query('DELETE FROM team_members WHERE team_id=$1 AND user_id=$2', [membership.rows[0].id,userId]);
      membership = { rowCount: 0, rows: [] };
    }
    let team;
    if (!membership.rowCount) {
      const user = await client.query('SELECT full_name FROM users WHERE id=$1', [userId]);
      if (!user.rowCount) throw Object.assign(new Error('Please sign in again.'), { status: 401 });
      const joinCode = crypto.randomBytes(8).toString('hex').toUpperCase();
      const created = await client.query(`INSERT INTO teams(name,join_code,leader_id,status,current_level) VALUES($1,$2,$3,'lobby',1) RETURNING *`, [`${user.rows[0].full_name}'s Hunt`, joinCode, userId]);
      team = created.rows[0];
      await client.query('INSERT INTO team_members(team_id,user_id) VALUES($1,$2)', [team.id,userId]);
      await client.query(`INSERT INTO characters(user_id,character_name,archetype,appearance) VALUES($1,$2,'The Codebreaker','{"preset":0,"outfit":"bronze"}'::jsonb) ON CONFLICT(user_id) DO NOTHING`, [userId, user.rows[0].full_name.slice(0,24)]);
    } else team = membership.rows[0];
    const oldAssignments = await client.query('SELECT COUNT(*)::int AS count FROM team_challenges WHERE team_id=$1', [team.id]);
    if (Number(oldAssignments.rows[0].count) === 0) {
      await client.query(`UPDATE teams SET status='lobby',current_level=1,game_started_at=NULL,completed_at=NULL,coins=0,gems=0,current_question=1,focus_violations=0,terminated_at=NULL WHERE id=$1`, [team.id]);
      team = (await client.query('SELECT * FROM teams WHERE id=$1', [team.id])).rows[0];
    }
    if (team.status === 'completed') throw Object.assign(new Error('This hunt has already been completed.'), { status: 409 });
    if (team.status === 'terminated') throw Object.assign(new Error('This attempt was terminated by the focus rules. Contact the organizer.'), { status: 403 });
    if (team.status !== 'in_progress') await client.query("UPDATE teams SET status='in_progress', game_started_at=COALESCE(game_started_at,NOW()), current_level=1 WHERE id=$1", [team.id]);
    await assignChallenge(client, team.id, Number(team.current_level || 1));
    await client.query('COMMIT');
    return getGameState(userId);
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

async function getAssigned(client, teamId, level) {
  const r = await client.query(`SELECT tc.*, c.slug, c.title, c.challenge_type, c.public_payload, c.private_payload, c.level
    FROM team_challenges tc JOIN challenges c ON c.id=tc.challenge_id WHERE tc.team_id=$1 AND c.level=$2 FOR UPDATE OF tc`, [teamId, level]);
  if (!r.rowCount) throw Object.assign(new Error('Challenge not assigned. Start the game first.'), { status: 409 });
  return r.rows[0];
}
async function recordSubmission(client, assignment, userId, submission, result, passed) {
  await client.query('UPDATE team_challenges SET attempts=attempts+1 WHERE id=$1', [assignment.id]);
  const r = await client.query('INSERT INTO challenge_submissions(team_challenge_id, submitted_by, submission, result, passed) VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at', [assignment.id, userId, JSON.stringify(submission), JSON.stringify(result), passed]);
  return r.rows[0];
}

export async function submitLevel(userId, level, body) {
  if (!Number.isInteger(level) || level < 1 || level > 5) throw Object.assign(new Error('Invalid level.'), { status: 400 });
  const team = await getTeamForUser(userId);
  if (!team) throw Object.assign(new Error('Start your individual hunt first.'), { status: 400 });
  if (team.status !== 'in_progress') throw Object.assign(new Error('The game is not active.'), { status: 409 });
  if (Number(team.current_level) !== level) throw Object.assign(new Error(`Level ${level} is not currently unlocked.`), { status: 409 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(`SELECT t.id AS team_id,t.current_level,t.status,t.coins,t.gems,tc.id AS assignment_id,c.id AS challenge_id,c.title,c.public_payload,c.private_payload,c.level
      FROM teams t JOIN team_challenges tc ON tc.team_id=t.id JOIN challenges c ON c.id=tc.challenge_id
      WHERE t.id=$1 AND c.level=$2 FOR UPDATE OF t,tc`, [team.id, level]);
    if (!locked.rowCount) throw Object.assign(new Error('This level has no assigned question bank. Ask the organizer to import questions.'), { status: 409 });
    const a = locked.rows[0];
    if (a.status !== 'in_progress' || Number(a.current_level) !== level) throw Object.assign(new Error('Game state changed. Refresh and try again.'), { status: 409 });
    const questionId = clean(body.questionId);
    const rawAnswer = clean(body.answer);
    const question = (a.public_payload.questions || []).find(q => String(q.id) === questionId);
    const expected = a.private_payload.answers?.[questionId];
    if (!question || !expected) throw Object.assign(new Error('Unknown question. Refresh the game and try again.'), { status: 400 });
    const normalizeText = (value) => clean(value).normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
    const answer = question.answerType === 'multiple_choice' ? rawAnswer.toUpperCase() : normalizeText(rawAnswer);
    // Idempotency: a double-click or network retry carries the same attemptId, so it is never counted (or penalised) twice.
    const attemptId = clean(body.attemptId).slice(0, 100);
    if (attemptId) {
      const dup = await client.query(`SELECT result FROM challenge_submissions WHERE team_challenge_id=$1 AND submission->>'attemptId'=$2 LIMIT 1`, [a.assignment_id, attemptId]);
      if (dup.rowCount) {
        await client.query('COMMIT');
        const r = dup.rows[0].result || {};
        return { ...r, duplicate: true, penaltySeconds: 0, gameState: await getGameState(userId) };
      }
    }
    const prior = await client.query(`SELECT passed FROM challenge_submissions WHERE team_challenge_id=$1 AND submission->>'questionId'=$2 AND passed=TRUE LIMIT 1`, [a.assignment_id, questionId]);
    if (prior.rowCount) {
      await client.query('COMMIT');
      return { passed: true, alreadyRewarded: true, feedback: 'This question has already been solved. Your treasure was not counted twice.', gameState: await getGameState(userId) };
    }
    const solvedRows = await client.query(`SELECT DISTINCT submission->>'questionId' AS question_id FROM challenge_submissions WHERE team_challenge_id=$1 AND passed=TRUE`, [a.assignment_id]);
    const solvedIds = new Set(solvedRows.rows.map(row => row.question_id));
    const nextQuestion = (a.public_payload.questions || []).find(q => !solvedIds.has(String(q.id)));
    if (!nextQuestion || String(nextQuestion.id) !== questionId) throw Object.assign(new Error('Answer the currently displayed question before moving ahead.'), { status: 409 });
    let correct = false;
    if (question.answerType === 'multiple_choice') correct = answer === String(expected.correctOption).toUpperCase();
    else if (question.answerType === 'text' && expected.exactMatch) { const squash = (v) => clean(v).replace(/\s+/g, ''); correct = (expected.acceptedAnswers || []).some(value => squash(value) === squash(rawAnswer)); }
    else if (question.answerType === 'text') correct = (expected.acceptedAnswers || []).some(value => { const target = normalizeText(value); return target === answer || (target.length >= 4 && (` ${answer} `).includes(` ${target} `)); });
    else if (question.answerType === 'text_rubric') {
      const sentenceCount = (rawAnswer.match(/[.!?]+(?=\s|$)/g) || []).length;
      const groupHits = (expected.requiredGroups || []).filter(group => group.some(term => normalizeText(term).split(' ').every(token => answer.includes(token)))).length;
      correct = sentenceCount >= Number(expected.minSentences || 3) && sentenceCount <= Number(expected.maxSentences || 5) && groupHits >= (expected.requiredGroups || []).length;
    }
    const penaltySeconds = correct ? 0 : WRONG_ANSWER_PENALTY_SECONDS;
    const result = { passed: correct, questionId, penaltySeconds, feedback: correct ? 'Correct! Treasure secured.' : question.answerType === 'text_rubric' ? 'Your response needs 3–5 sentences and must address each part of the mission: red flags, independent verification, and protecting teammates.' : 'Incorrect answer! +1 minute penalty. Read the question again and try once more.', explanation: correct ? (expected.explanation || '') : undefined };
    await recordSubmission(client, { id: a.assignment_id }, userId, { questionId, answer, attemptId: attemptId || undefined }, result, correct);
    if (!correct) await client.query('UPDATE teams SET penalty_seconds=penalty_seconds+$2, wrong_answers=wrong_answers+1, updated_at=NOW() WHERE id=$1', [team.id, WRONG_ANSWER_PENALTY_SECONDS]);
    let coinsAwarded = 0, gemsAwarded = 0, levelCompleted = false;
    if (correct) {
      coinsAwarded = COINS_PER_CORRECT_ANSWER;
      await client.query('UPDATE teams SET coins=coins+$2 WHERE id=$1', [team.id, COINS_PER_CORRECT_ANSWER]);
      const solved = await client.query(`SELECT COUNT(DISTINCT submission->>'questionId')::int AS n FROM challenge_submissions WHERE team_challenge_id=$1 AND passed=TRUE`, [a.assignment_id]);
      if (solved.rows[0].n >= (a.public_payload.questions || []).length) {
        levelCompleted = true; coinsAwarded += LEVEL_COMPLETION_BONUS; gemsAwarded = GEMS_PER_LEVEL;
        await client.query('UPDATE teams SET coins=coins+$2,gems=gems+$3,current_question=1 WHERE id=$1', [team.id, LEVEL_COMPLETION_BONUS, GEMS_PER_LEVEL]);
        await client.query('UPDATE team_challenges SET completed_at=COALESCE(completed_at,NOW()) WHERE id=$1', [a.assignment_id]);
        if (level === 5) await client.query("UPDATE teams SET status='completed',completed_at=NOW(),current_level=5 WHERE id=$1", [team.id]);
        else await client.query('UPDATE teams SET current_level=$2,current_question=1 WHERE id=$1', [team.id, level + 1]);
      } else {
        await client.query('UPDATE teams SET current_question=LEAST(8,$2+1) WHERE id=$1', [team.id, Number(team.current_question || 1)]);
      }
    }
    await client.query('COMMIT');
    const gameState = await getGameState(userId);
    return { ...result, level, coinsAwarded, gemsAwarded, levelCompleted, correctOption: correct ? expected.correctOption : undefined, gameState };
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

export async function createTeam(userId, name) {
  const safeName = clean(name).replace(/\s+/g, ' ');
  if (safeName.length < 3 || safeName.length > 80) throw Object.assign(new Error('Team name must be 3–80 characters.'), { status: 400 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const member = await client.query('SELECT team_id FROM team_members WHERE user_id=$1', [userId]);
    if (member.rowCount) throw Object.assign(new Error('You are already on a team.'), { status: 409 });
    const count = await client.query("SELECT COUNT(*)::int AS count FROM teams");
    if (count.rows[0].count >= TEAM_LIMIT) throw Object.assign(new Error(`This event allows up to ${TEAM_LIMIT} teams.`), { status: 409 });
    let joinCode = crypto.randomBytes(4).toString('hex').toUpperCase();
    for (let i = 0; i < 4; i++) {
      const exists = await client.query('SELECT 1 FROM teams WHERE join_code=$1', [joinCode]);
      if (!exists.rowCount) break;
      joinCode = crypto.randomBytes(4).toString('hex').toUpperCase();
    }
    const created = await client.query('INSERT INTO teams(name,join_code,leader_id) VALUES ($1,$2,$3) RETURNING id,name,join_code,leader_id,status,current_level,created_at', [safeName, joinCode, userId]);
    await client.query('INSERT INTO team_members(team_id,user_id) VALUES ($1,$2)', [created.rows[0].id, userId]);
    await client.query('COMMIT');
    return created.rows[0];
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}
export async function joinTeam(userId, joinCode) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if ((await client.query('SELECT 1 FROM team_members WHERE user_id=$1', [userId])).rowCount) throw Object.assign(new Error('You are already on a team.'), { status: 409 });
    const teamResult = await client.query("SELECT * FROM teams WHERE join_code=$1 FOR UPDATE", [clean(joinCode).toUpperCase()]);
    if (!teamResult.rowCount) throw Object.assign(new Error('Team code not found.'), { status: 404 });
    const team = teamResult.rows[0];
    if (team.status !== 'lobby') throw Object.assign(new Error('This team has already started or completed the game.'), { status: 409 });
    const count = await client.query('SELECT COUNT(*)::int AS count FROM team_members WHERE team_id=$1', [team.id]);
    if (count.rows[0].count >= TEAM_SIZE) throw Object.assign(new Error(`Teams can have at most ${TEAM_SIZE} members.`), { status: 409 });
    await client.query('INSERT INTO team_members(team_id,user_id) VALUES ($1,$2)', [team.id,userId]);
    await client.query('COMMIT');
    return { id: team.id, name: team.name, joinCode: team.join_code, status: team.status };
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

export async function saveCharacter(userId, data) {
  const name = clean(data.characterName || '');
  const archetype = clean(data.archetype || 'The Codebreaker');
  const allowed = ['The Codebreaker','The Cyber Detective','The Ancient Engineer','The Cryptographer','The Data Alchemist','The Space Explorer','The Forest Guardian','The Deep-Sea Explorer'];
  if (name.length < 1 || name.length > 24) throw Object.assign(new Error('Character name must be 1–24 characters.'), { status: 400 });
  if (!allowed.includes(archetype)) throw Object.assign(new Error('Unknown character archetype.'), { status: 400 });
  const team = await getTeamForUser(userId);
  if (!team) throw Object.assign(new Error('Join a team before customizing your character.'), { status: 400 });
  const r = await pool.query(`INSERT INTO characters(user_id,character_name,archetype,appearance) VALUES ($1,$2,$3,$4)
    ON CONFLICT(user_id) DO UPDATE SET character_name=EXCLUDED.character_name, archetype=EXCLUDED.archetype, appearance=EXCLUDED.appearance, updated_at=NOW()
    RETURNING user_id,character_name,archetype,appearance,updated_at`, [userId,name,archetype,JSON.stringify(data.appearance || {})]);
  return r.rows[0];
}

export async function getLeaderboard() {
  const r = await pool.query(`SELECT t.id,t.name,t.status,t.current_level,c.name AS classroom,
    COUNT(DISTINCT CASE WHEN tc.completed_at IS NOT NULL THEN ch.level END)::int AS levels_completed, t.coins, t.gems, t.final_score,
    t.game_started_at,t.completed_at,t.penalty_seconds,t.wrong_answers,
    CASE WHEN t.game_started_at IS NOT NULL THEN EXTRACT(EPOCH FROM (COALESCE(t.completed_at,NOW())-t.game_started_at))::int ELSE NULL END AS elapsed_seconds,
    CASE WHEN t.game_started_at IS NOT NULL THEN EXTRACT(EPOCH FROM (COALESCE(t.completed_at,NOW())-t.game_started_at))::int + t.penalty_seconds ELSE NULL END AS total_seconds,
    COALESCE((SELECT json_agg(json_build_object('name',u.full_name,'character',cr.character_name) ORDER BY tm.joined_at) FROM team_members tm JOIN users u ON u.id=tm.user_id LEFT JOIN characters cr ON cr.user_id=u.id WHERE tm.team_id=t.id),'[]'::json) AS members
    FROM teams t LEFT JOIN classrooms c ON c.id=t.classroom_id LEFT JOIN team_challenges tc ON tc.team_id=t.id LEFT JOIN challenges ch ON ch.id=tc.challenge_id
    WHERE EXISTS (SELECT 1 FROM team_challenges active_tc WHERE active_tc.team_id=t.id)
    GROUP BY t.id,c.name ORDER BY (t.status='completed') DESC, (t.completed_at IS NULL), total_seconds ASC NULLS LAST, t.created_at ASC`);
  return r.rows.map((row, i) => ({ rank: i + 1, ...row }));
}

export async function organizerTeamList() {
  const r = await pool.query(`SELECT t.id,t.name,t.join_code,t.status,t.current_level,t.game_started_at,t.completed_at,c.name AS classroom,
    json_agg(json_build_object('id',u.id,'name',u.full_name,'email',u.email) ORDER BY tm.joined_at) FILTER (WHERE u.id IS NOT NULL) AS members
    FROM teams t LEFT JOIN classrooms c ON c.id=t.classroom_id LEFT JOIN team_members tm ON tm.team_id=t.id LEFT JOIN users u ON u.id=tm.user_id GROUP BY t.id,c.name ORDER BY t.created_at`);
  return r.rows;
}
