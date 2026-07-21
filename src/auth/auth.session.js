import { randomBytes } from 'node:crypto';
import { sessionDays } from '../config/app-config.js';
import { requireUser, currentUser } from '../shared/middleware/auth.middleware.js';
import { tokenHash } from '../config/database.js';

export async function createSession(db, userId) {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + sessionDays * 86400000).toISOString();
  await db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(tokenHash(token), userId, expiresAt, now.toISOString());
  return { token, expiresAt };
}

export { currentUser, requireUser };
