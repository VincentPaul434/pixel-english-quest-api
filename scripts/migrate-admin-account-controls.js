import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../src/config/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '';
if (!databaseUrl) throw new Error('SUPABASE_DB_URL or DATABASE_URL is required.');

const migration = await readFile(path.join(__dirname, '..', 'supabase', 'migrations', '20260723_admin_account_controls.sql'), 'utf8');
const db = createDatabase({ databaseUrl });
try {
  await db.exec(migration);
  console.log('Administrator account-control migration applied.');
} finally {
  await db.close();
}
