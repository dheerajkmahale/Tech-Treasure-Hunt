import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pool } from './pool.js';
import { LEVELS } from '../services/challenges.js';
const source = process.argv[2];
if (!pool) { console.error('DATABASE_URL is required.'); process.exit(1); }
if (!source) { console.error('Usage: npm run questions:import --workspace server -- ./seeds/approved-question-bank.json'); process.exit(1); }
const expectedCounts = [5,5,5,5,5];
const fail = (message) => { throw new Error(message); };
try {
  const bank = JSON.parse(await fs.readFile(path.resolve(process.cwd(), source), 'utf8'));
  if (!Array.isArray(bank.levels) || bank.levels.length !== 5) fail('The bank must contain exactly five levels.');
  const seen = new Set();
  for (let i=0;i<5;i++) {
    const level=bank.levels[i];
    if (Number(level.level)!==i+1) fail(`Expected level ${i+1} in position ${i+1}.`);
    if (!Array.isArray(level.questions) || level.questions.length!==expectedCounts[i]) fail(`Level ${i+1} needs exactly ${expectedCounts[i]} questions; found ${level.questions?.length??0}.`);
    for (const [index,q] of level.questions.entries()) {
      if (!q.id || seen.has(q.id)) fail(`Question ${index+1} in level ${i+1} needs a unique id.`); seen.add(q.id);
      if (typeof q.question!=='string'||!q.question.trim()) fail(`Question ${q.id} needs question text.`);
      if (!['text','multiple_choice','text_rubric'].includes(q.answerType)) fail(`Question ${q.id} has an unsupported answerType.`);
      if (q.answerType==='multiple_choice') {
        if (!Array.isArray(q.options)||q.options.length<2||q.options.some(x=>!(typeof x==='string'&&x.trim())&&!(x&&typeof x==='object'&&typeof x.label==='string'&&x.label.trim()&&(x.text||x.image)))) fail(`Question ${q.id} needs at least two valid text/image options.`);
        const keys=['A','B','C','D'];
        if (!keys.includes(String(q._answer?.correctOption).toUpperCase())||keys.indexOf(String(q._answer.correctOption).toUpperCase())>=q.options.length) fail(`Question ${q.id} has an invalid correctOption.`);
      } else if (q.answerType==='text' && (!Array.isArray(q._answer?.acceptedAnswers)||!q._answer.acceptedAnswers.length)) fail(`Question ${q.id} needs acceptedAnswers.`);
      else if (q.answerType==='text_rubric' && (!Array.isArray(q._answer?.requiredGroups)||!q._answer.requiredGroups.length)) fail(`Question ${q.id} needs required keyword groups.`);
    }
  }
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM team_challenges'); await client.query('DELETE FROM challenges');
    for (const level of bank.levels) {
      const meta=LEVELS[level.level-1];
      const publicQuestions=level.questions.map(q=>({id:q.id,question:q.question,answerType:q.answerType, ...(q.code?{code:String(q.code)}:{}), ...(q.options?{options:q.options.map(o=>typeof o==='string'?o:{label:o.label,text:o.text||'',...(o.image?{image:o.image}:{})})}:{}), ...(q.imageOptions?{imageOptions:q.imageOptions}:{})}));
      const answers=Object.fromEntries(level.questions.map(q=>{const a={...q._answer};delete a.correctOption;return [q.id,{...a, ...(q._answer.correctOption?{correctOption:String(q._answer.correctOption).toUpperCase()}:{}),answerType:q.answerType}];}));
      await client.query(`INSERT INTO challenges(level,slug,title,challenge_type,public_payload,private_payload,difficulty) VALUES($1,$2,$3,'multiple_choice',$4::jsonb,$5::jsonb,$6)`,[level.level,`level-${level.level}-question-bank`,meta.title,JSON.stringify({questions:publicQuestions}),JSON.stringify({answers}),meta.difficulty.toLowerCase()]);
    }
    await client.query('COMMIT');
    console.log('Imported 25 questions across five levels (5 per level).');
  } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
} catch(e) { console.error(`Question import failed: ${e.message}`); process.exitCode=1; }
finally { await pool.end(); }
