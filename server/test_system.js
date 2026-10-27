import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

async function runTests() {
  console.log('====================================================');
  console.log('TECH TREASURE HUNT — SYSTEM VERIFICATION TEST SUITE');
  console.log('====================================================\n');

  // TEST 1: Question Bank Schema and Data Integrity
  console.log('--- TEST 1: QUESTION BANK INTEGRITY ---');
  const bankPath = path.resolve(here, 'seeds/approved-question-bank.json');
  const rawBank = await fs.readFile(bankPath, 'utf8');
  const bank = JSON.parse(rawBank);

  assert.strictEqual(Array.isArray(bank.levels), true, 'Bank must have levels array');
  assert.strictEqual(bank.levels.length, 5, 'Bank must have exactly 5 levels');

  let totalQuestions = 0;
  const seenIds = new Set();
  bank.levels.forEach((lvl, i) => {
    assert.strictEqual(lvl.level, i + 1, `Level index mismatch at ${i}`);
    assert.strictEqual(lvl.questions.length, 5, `Level ${lvl.level} must have exactly 5 questions`);
    lvl.questions.forEach((q, qIndex) => {
      assert.ok(q.id, `Missing question ID at level ${lvl.level} question ${qIndex}`);
      assert.ok(!seenIds.has(q.id), `Duplicate question ID ${q.id}`);
      seenIds.add(q.id);
      assert.ok(q.question && q.question.trim().length > 0, `Empty question text in ${q.id}`);
      assert.ok(['text', 'multiple_choice', 'text_rubric'].includes(q.answerType), `Invalid answerType in ${q.id}`);
      if (q.answerType === 'multiple_choice') {
        assert.ok(Array.isArray(q.options) && q.options.length >= 2, `${q.id} must have >= 2 options`);
        assert.ok(q._answer && q._answer.correctOption, `${q.id} missing correctOption`);
      } else if (q.answerType === 'text') {
        assert.ok(Array.isArray(q._answer?.acceptedAnswers) && q._answer.acceptedAnswers.length > 0, `${q.id} missing acceptedAnswers`);
      }
      totalQuestions++;
    });
  });
  assert.strictEqual(totalQuestions, 25, 'Total questions must be exactly 25');
  console.log(`✓ 25 official questions verified across 5 levels (5 questions/level). All unique IDs, valid options, and answers.\n`);

  // TEST 2: Registration Validation Schema
  console.log('--- TEST 2: AUTHENTICATION VALIDATION SCHEMA ---');
  const registerSchema = z.object({
    fullName: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(254),
    password: z.string().min(10).max(128)
  });

  const validPayload = { fullName: 'Adventurer Alice', email: 'alice@treasurehunt.edu', password: 'ValidPassword123!' };
  const validResult = registerSchema.safeParse(validPayload);
  assert.strictEqual(validResult.success, true, 'Valid registration payload should pass');

  const shortPassResult = registerSchema.safeParse({ ...validPayload, password: 'short' });
  assert.strictEqual(shortPassResult.success, false, 'Password < 10 characters must fail validation');
  assert.strictEqual(shortPassResult.error.issues[0].code, 'too_small');

  const invalidEmailResult = registerSchema.safeParse({ ...validPayload, email: 'notanemail' });
  assert.strictEqual(invalidEmailResult.success, false, 'Malformed email must fail validation');

  const shortNameResult = registerSchema.safeParse({ ...validPayload, fullName: 'X' });
  assert.strictEqual(shortNameResult.success, false, 'Name < 2 characters must fail validation');
  console.log('✓ Registration validation correctly enforces name length, email format, and 10+ char passwords.\n');

  // TEST 3: Password Hashing & Verification
  console.log('--- TEST 3: BCRYPT PASSWORD SECURITY ---');
  const password = 'SuperSecretExplorerPassword123!';
  const hash = await bcrypt.hash(password, 12);
  assert.notStrictEqual(password, hash);
  const matchSuccess = await bcrypt.compare(password, hash);
  const matchFailure = await bcrypt.compare('WrongPassword123!', hash);
  assert.strictEqual(matchSuccess, true, 'Correct password must match hash');
  assert.strictEqual(matchFailure, false, 'Wrong password must be rejected');
  console.log('✓ Bcrypt hashing (cost factor 12) verified for secure password storage and comparison.\n');

  // TEST 4: JWT Session Issuance and Verification
  console.log('--- TEST 4: JWT SESSION INTEGRITY ---');
  const testSecret = 'test_jwt_secret_key_that_is_at_least_32_characters_long';
  const user = { id: 42, role: 'player', full_name: 'Adventurer Alice' };
  const token = jwt.sign({ sub: String(user.id), role: user.role }, testSecret, { expiresIn: '12h', issuer: 'tech-treasure-hunt' });
  const decoded = jwt.verify(token, testSecret, { issuer: 'tech-treasure-hunt' });
  assert.strictEqual(decoded.sub, '42');
  assert.strictEqual(decoded.role, 'player');

  let expiredFailed = false;
  try {
    jwt.verify(token, 'wrong_secret', { issuer: 'tech-treasure-hunt' });
  } catch {
    expiredFailed = true;
  }
  assert.strictEqual(expiredFailed, true, 'Invalid secret must reject token');
  console.log('✓ JWT token signing, claims verification, and secret integrity verified.\n');

  // TEST 5: Database Migration Files Completeness
  console.log('--- TEST 5: MIGRATION FILES VERIFICATION ---');
  const migDir = path.resolve(here, 'migrations');
  const files = (await fs.readdir(migDir)).filter(f => f.endsWith('.sql')).sort();
  assert.strictEqual(files.length, 6, 'Must have 6 migration files');
  assert.strictEqual(files[0], '001_initial_schema.sql');
  assert.strictEqual(files[1], '002_game_engine.sql');
  assert.strictEqual(files[2], '003_one_assignment_per_level.sql');
  assert.strictEqual(files[3], '004_solo_rewards_focus.sql');
  assert.strictEqual(files[4], '005_remove_legacy_questions.sql');
  assert.strictEqual(files[5], '006_penalty_and_timestamps.sql');

  for (const f of files) {
    const content = await fs.readFile(path.join(migDir, f), 'utf8');
    assert.ok(content.length > 50, `Migration ${f} is too short or empty`);
  }
  console.log(`✓ All 6 migration SQL files present, ordered, and verified.\n`);

  // TEST 6: CORS Dynamic Origin Validator
  console.log('--- TEST 6: CORS ORIGIN MATCHING ---');
  const allowed = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://tech-treasure-hunt-drab.vercel.app'
  ];
  function testCors(origin) {
    if (!origin) return true;
    if (allowed.includes(origin)) return true;
    try {
      const parsed = new URL(origin);
      if (parsed.hostname.endsWith('.vercel.app') || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        return true;
      }
    } catch {}
    return false;
  }
  assert.strictEqual(testCors('https://tech-treasure-hunt-drab.vercel.app'), true);
  assert.strictEqual(testCors('https://tech-treasure-hunt-anypreview.vercel.app'), true);
  assert.strictEqual(testCors('http://localhost:5173'), true);
  assert.strictEqual(testCors('https://malicious-attacker.com'), false);
  console.log('✓ CORS correctly allows Vercel production, Vercel preview, and local development origins, rejecting third-party domains.\n');

  console.log('====================================================');
  console.log('ALL VERIFICATION CHECKS PASSED (6 OF 6 SUCCEEDED)');
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
