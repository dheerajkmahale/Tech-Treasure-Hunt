import 'dotenv/config';
import bcrypt from 'bcrypt';
import { pool } from './pool.js';
import { seedChallenges } from '../services/game.js';
if (!pool) { console.error('DATABASE_URL is required to seed the database.'); process.exit(1); }
try {
  for (const name of ['Classroom A','Classroom B','Classroom C','Classroom D']) await pool.query('INSERT INTO classrooms(name) VALUES($1) ON CONFLICT(name) DO NOTHING', [name]);
  await seedChallenges(pool);
  if (process.env.ORGANIZER_EMAIL && process.env.ORGANIZER_PASSWORD) {
    const email = process.env.ORGANIZER_EMAIL.toLowerCase();
    const passwordHash = await bcrypt.hash(process.env.ORGANIZER_PASSWORD, 12);
    await pool.query(`INSERT INTO users(full_name,email,password_hash,role) VALUES($1,$2,$3,'organizer')
      ON CONFLICT(email) DO UPDATE SET role='organizer'`, [process.env.ORGANIZER_NAME || 'Event Organizer', email, passwordHash]);
    console.log(`Organizer account ensured: ${email}`);
  } else console.log('Organizer not created: set ORGANIZER_EMAIL and ORGANIZER_PASSWORD in .env to create one during seeding.');
  console.log('Seeded four classrooms. No demo questions were seeded; import the approved question bank separately.');
} catch(e) { console.error('Seed failed:',e); process.exitCode=1; }
finally { await pool.end(); }
