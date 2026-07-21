import 'dotenv/config';
import { createDatabase, DEMO_ACCOUNTS } from '../src/config/database.js';
import { login } from '../src/auth/auth.service.js';

const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '';
if (!databaseUrl) throw new Error('SUPABASE_DB_URL or DATABASE_URL is required.');

const db = createDatabase({ databaseUrl });
try {
  const result = await login(db, DEMO_ACCOUNTS.teacher);
  console.log(JSON.stringify({ database: 'supabase', authenticated: true, role: result.user.role }));
} finally {
  await db.close();
}
