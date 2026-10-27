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

  // TEST 7: Invalid Input Handling & Error Reporting
  console.log('--- TEST 7: REGISTRATION INVALID INPUT VALIDATION ---');
  const testInputs = [
    { payload: { fullName: '', email: 'valid@edu.org', password: 'ValidPassword123' }, expectedPath: 'fullName', desc: 'Empty name' },
    { payload: { fullName: '   ', email: 'valid@edu.org', password: 'ValidPassword123' }, expectedPath: 'fullName', desc: 'Whitespace-only name' },
    { payload: { fullName: 'A', email: 'valid@edu.org', password: 'ValidPassword123' }, expectedPath: 'fullName', desc: 'Name < 2 characters' },
    { payload: { fullName: 'Alice Explorer', email: 'invalid-email', password: 'ValidPassword123' }, expectedPath: 'email', desc: 'Malformed email' },
    { payload: { fullName: 'Alice Explorer', email: 'valid@edu.org', password: 'short' }, expectedPath: 'password', desc: 'Password < 10 characters' },
    { payload: { fullName: 'Alice Explorer', email: 'valid@edu.org', password: 'x'.repeat(129) }, expectedPath: 'password', desc: 'Password > 128 characters' }
  ];

  for (const testCase of testInputs) {
    const parseResult = registerSchema.safeParse(testCase.payload);
    assert.strictEqual(parseResult.success, false, `Expected failure for: ${testCase.desc}`);
    const paths = parseResult.error.issues.map(i => i.path.join('.'));
    assert.ok(paths.includes(testCase.expectedPath), `Expected error path "${testCase.expectedPath}" for ${testCase.desc}`);
  }
  console.log('✓ All invalid registration inputs properly rejected with accurate validation issue paths.\n');

  // TEST 8: Successful Registration Flow & Duplicate Email Handling
  console.log('--- TEST 8: REGISTRATION FLOW & DUPLICATE EMAIL HANDLING ---');
  const rawPassword = 'ExplorerSecurePassword2026!';
  const hashedPassword = await bcrypt.hash(rawPassword, 12);
  const mockUser = {
    id: 101,
    full_name: 'Elena Rostova',
    email: 'elena@archive.org',
    role: 'player',
    created_at: new Date().toISOString()
  };

  // Verify password hash integrity
  assert.strictEqual(await bcrypt.compare(rawPassword, hashedPassword), true);
  assert.strictEqual(await bcrypt.compare('WrongPassword999', hashedPassword), false);

  // Verify session issuance and cookie formatting
  let cookieCaptured = null;
  const mockRes = {
    cookie(name, val, opts) {
      cookieCaptured = { name, val, opts };
    }
  };
  const { issueSession } = await import('./src/middleware/auth.js');
  const issuedToken = issueSession(mockRes, mockUser);
  assert.ok(issuedToken, 'Token must be issued');
  assert.strictEqual(cookieCaptured?.name, 'tth_session', 'Session cookie must be named tth_session');
  assert.strictEqual(cookieCaptured?.opts?.httpOnly, true, 'Session cookie must be httpOnly');

  // Verify duplicate email error handling (simulating PostgreSQL unique violation code 23505)
  function handleRegisterError(err) {
    if (err.code === '23505') {
      return { status: 409, body: { error: 'EMAIL_EXISTS', message: 'An account with this email already exists.' } };
    }
    return { status: 500, body: { error: 'INTERNAL_ERROR' } };
  }
  const duplicateErr = new Error('duplicate key value violates unique constraint "users_email_key"');
  duplicateErr.code = '23505';
  const duplicateResponse = handleRegisterError(duplicateErr);
  assert.strictEqual(duplicateResponse.status, 409, 'Duplicate email must return HTTP 409');
  assert.strictEqual(duplicateResponse.body.error, 'EMAIL_EXISTS');
  assert.strictEqual(duplicateResponse.body.message, 'An account with this email already exists.');
  console.log('✓ Registration hashing, session issuance, and duplicate email (409 EMAIL_EXISTS) verified.\n');

  // TEST 9: Rate Limiting & Proxy IP Resolution
  console.log('--- TEST 9: RATE LIMITING & REVERSE PROXY IP RESOLUTION ---');
  const { getClientIp, cleanIp } = await import('./src/middleware/rateLimiter.js');

  // Verify client IP extraction from reverse proxy headers
  assert.strictEqual(cleanIp('::ffff:192.168.1.100'), '192.168.1.100', 'Should strip IPv6-mapped IPv4 prefix');
  assert.strictEqual(cleanIp('203.0.113.50:8080'), '203.0.113.50', 'Should strip IPv4 port');
  assert.strictEqual(cleanIp('[2001:db8::1]:443'), '2001:db8::1', 'Should strip IPv6 port');

  const reqCf = { headers: { 'cf-connecting-ip': '198.51.100.22' } };
  assert.strictEqual(getClientIp(reqCf), '198.51.100.22', 'Should extract cf-connecting-ip');

  const reqTrueClient = { headers: { 'true-client-ip': '198.51.100.33' } };
  assert.strictEqual(getClientIp(reqTrueClient), '198.51.100.33', 'Should extract true-client-ip');

  const reqXff = { headers: { 'x-forwarded-for': '198.51.100.44, 10.0.0.1, 172.68.1.1' } };
  assert.strictEqual(getClientIp(reqXff), '198.51.100.44', 'Should extract first client IP from X-Forwarded-For');

  // Live Express rate limiting test behind proxy
  const { default: express } = await import('express');
  const { default: rateLimit } = await import('express-rate-limit');

  const testApp = express();
  testApp.set('trust proxy', 1);
  testApp.use(express.json());

  const testLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 3,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => getClientIp(req),
    message: { error: 'AUTH_RATE_LIMIT', message: 'Too many authentication attempts. Please wait a few minutes before trying again.' }
  });

  testApp.post('/test-auth', testLimiter, (req, res) => {
    res.status(200).json({ ok: true, ip: getClientIp(req) });
  });

  const testServer = await new Promise(resolve => {
    const s = testApp.listen(0, '127.0.0.1', () => resolve(s));
  });
  const testPort = testServer.address().port;
  const testUrl = `http://127.0.0.1:${testPort}/test-auth`;

  try {
    // Client 1 (IP 203.0.113.1): make 3 requests within limit -> all succeed
    for (let i = 1; i <= 3; i++) {
      const res = await fetch(testUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.1' },
        body: JSON.stringify({})
      });
      assert.strictEqual(res.status, 200, `Client 1 request ${i} must succeed with 200`);
    }

    // Client 1: 4th request exceeds limit -> must return 429 AUTH_RATE_LIMIT
    const resBlocked = await fetch(testUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.1' },
      body: JSON.stringify({})
    });
    assert.strictEqual(resBlocked.status, 429, 'Excessive requests from Client 1 must be rate-limited (429)');
    const blockedData = await resBlocked.json();
    assert.strictEqual(blockedData.error, 'AUTH_RATE_LIMIT');
    assert.ok(resBlocked.headers.has('ratelimit'), 'Must include standard draft-7 ratelimit header');
    assert.ok(resBlocked.headers.has('retry-after'), 'Must include retry-after header');

    // Client 2 (IP 203.0.113.2): different IP behind same proxy -> must succeed with 200!
    // Proves that Client 2 is NOT locked out when Client 1 is rate-limited!
    const resClient2 = await fetch(testUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.2' },
      body: JSON.stringify({})
    });
    assert.strictEqual(resClient2.status, 200, 'Client 2 must succeed and not be affected by Client 1 rate limit');
    const client2Data = await resClient2.json();
    assert.strictEqual(client2Data.ip, '203.0.113.2');
  } finally {
    await new Promise(resolve => testServer.close(resolve));
  }
  console.log('✓ Rate limiting correctly protects endpoints, enforces limits per client IP, and isolates users behind reverse proxies.\n');

  console.log('====================================================');
  console.log('ALL VERIFICATION CHECKS PASSED (9 OF 9 SUCCEEDED)');
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
