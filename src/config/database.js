import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import pg from 'pg';

pg.types.setTypeParser(20, Number);
pg.types.setTypeParser(1700, Number);

export const DEMO_ACCOUNTS = {
  teacher: { email: 'teacher@pixel.academy', password: 'Teach123!' },
  student: { email: 'student@pixel.academy', password: 'Learn123!' }
};

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const digest = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${digest}`;
}

export function verifyPassword(password, stored) {
  const [salt, digest] = String(stored || '').split(':');
  if (!salt || !digest) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(digest, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

function postgresSql(sql) {
  let parameter = 0;
  const ignoredInsert = /INSERT\s+OR\s+IGNORE\s+INTO/i.test(sql);
  let normalized = sql
    .replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO')
    .replace(/MAX\(progress\.best_score,\s*excluded\.best_score\)/gi, 'GREATEST(progress.best_score, excluded.best_score)')
    .replace(/\bAS\s+([a-z][A-Za-z0-9_]*[A-Z][A-Za-z0-9_]*)/g, 'AS "$1"')
    .replace(/\?/g, () => `$${++parameter}`);
  if (ignoredInsert && !/\bON\s+CONFLICT\b/i.test(normalized)) {
    normalized = `${normalized.trim().replace(/;$/, '')} ON CONFLICT DO NOTHING`;
  }
  return normalized;
}

class SupabaseDatabase {
  constructor(connection, ownsConnection = true) {
    this.connection = connection;
    this.ownsConnection = ownsConnection;
  }

  prepare(sql) {
    const text = postgresSql(sql);
    return {
      get: async (...params) => (await this.connection.query(text, params)).rows[0],
      all: async (...params) => (await this.connection.query(text, params)).rows,
      run: async (...params) => {
        const result = await this.connection.query(text, params);
        return { changes: result.rowCount };
      }
    };
  }

  async exec(sql) {
    await this.connection.query(sql);
  }

  async transaction(work) {
    const client = await this.connection.connect();
    const transaction = new SupabaseDatabase(client, false);
    try {
      await client.query('BEGIN');
      const result = await work(transaction);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    if (this.ownsConnection) await this.connection.end();
  }
}

export function createDatabase({ databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL } = {}) {
  if (!databaseUrl) {
    throw new Error('SUPABASE_DB_URL or DATABASE_URL is required. Run npm run supabase:setup before starting the API.');
  }

  const ssl = process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false };
  return new SupabaseDatabase(new pg.Pool({
    connectionString: databaseUrl,
    ssl,
    max: Number(process.env.DB_POOL_SIZE) || 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  }));
}

export async function inTransaction(db, work) {
  return db.transaction(work);
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    proficiency: row.proficiency,
    learningGoal: row.learning_goal,
    dailyGoal: row.daily_goal,
    onboardingComplete: Boolean(row.onboarding_complete),
    isAdmin: Boolean(row.is_admin),
    emailVerified: Boolean(row.email_verified_at),
    locale: row.locale || 'en',
    mfaEnabled: Boolean(row.mfa_enabled),
    xp: row.xp,
    level: Math.floor(row.xp / 250) + 1
  };
}

export async function addActivity(db, userId, activity) {
  await db.prepare(`INSERT INTO activities (id, user_id, type, icon, title, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), userId, activity.type, activity.icon || 'sparkle', activity.title, activity.detail, new Date().toISOString());
}

export function uniqueId(prefix) {
  return `${prefix}-${randomUUID()}`;
}
