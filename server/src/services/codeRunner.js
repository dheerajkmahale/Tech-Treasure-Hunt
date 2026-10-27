/**
 * Never execute user code in this API process. This adapter targets a separately
 * configured Judge0-compatible isolated execution service. If it is not configured,
 * Level 5 submission returns a clear 503 and does not fake a passing result.
 */
export async function runInSandbox({ code, language, challenge, tests }) {
  if (!process.env.CODE_RUNNER_URL) {
    throw Object.assign(new Error('Level 5 code execution is not configured. Set CODE_RUNNER_URL to a Judge0-compatible isolated runner before enabling the final level.'), { status: 503, code: 'CODE_RUNNER_NOT_CONFIGURED' });
  }
  if (language.toLowerCase() !== 'javascript' && language.toLowerCase() !== 'javascript (node.js)') {
    throw Object.assign(new Error('This challenge currently supports JavaScript (Node.js) only.'), { status: 400 });
  }
  const wrapper = `\nconst __cases = ${JSON.stringify(tests)};\nconst __results = [];\nfor (const __t of __cases) { try { __results.push(search(__t.values, __t.target)); } catch (e) { __results.push({error: String(e)}); } }\nconsole.log(JSON.stringify(__results));\n`;
  const endpoint = process.env.CODE_RUNNER_URL.replace(/\/$/, '') + '/submissions?base64_encoded=false&wait=true';
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.CODE_RUNNER_API_KEY) headers['X-Auth-Token'] = process.env.CODE_RUNNER_API_KEY;
  const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ language_id: 63, source_code: code + wrapper, stdin: '', cpu_time_limit: 2, memory_limit: 65536 }), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw Object.assign(new Error(`The isolated code runner returned HTTP ${response.status}.`), { status: 502, code: 'CODE_RUNNER_ERROR' });
  const payload = await response.json();
  if (payload.status?.id === 1 || payload.status?.id === 2) throw Object.assign(new Error('The code runner has not finished execution yet. Please retry.'), { status: 502 });
  if (payload.compile_output || payload.stderr || payload.status?.id >= 6) return { passed: false, feedback: 'The solution did not compile or produced a runtime error.', runnerStatus: payload.status?.description || 'Error', details: String(payload.compile_output || payload.stderr || '').slice(0, 1500) };
  let actual;
  try { actual = JSON.parse(String(payload.stdout || '').trim()); } catch { return { passed: false, feedback: 'The solution did not return the expected JSON result for all test cases.', details: String(payload.stdout || '').slice(0, 1000) }; }
  const expected = tests.map(t => t.expected);
  const testsPassed = Array.isArray(actual) && actual.length === expected.length && expected.every((v, i) => actual[i] === v);
  const compact = code.replace(/\s+/g, ' ');
  // A conservative heuristic only; this is not a formal complexity proof.
  const midpoint = /Math\.floor\s*\(/.test(code) && /(mid|middle)/i.test(code);
  const loop = /\bwhile\s*\(|\bfor\s*\(/.test(code);
  const narrowing = /(left|low|start)\s*=|=(\s*)(right|high|end)/i.test(compact) && /(left|low|right|high)/i.test(compact);
  const complexityHeuristic = midpoint && loop && narrowing;
  const passed = testsPassed && complexityHeuristic;
  return { passed, testsPassed, complexityHeuristic, feedback: passed ? 'All tests passed and the code contains a binary-search-shaped loop. Complexity is checked heuristically, not formally proven.' : (!testsPassed ? 'One or more test cases failed. Check boundary conditions and the absent-target case.' : 'Tests passed, but the code did not satisfy the simple binary-search structure check. This heuristic is not a formal complexity proof.'), runnerStatus: payload.status?.description || 'Completed', executionTime: payload.time ?? null, memory: payload.memory ?? null };
}
