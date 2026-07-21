import { tokenHash } from '../../config/database.js';
import { AppError } from '../utils/appError.js';

export async function currentUser(req, db) {
  const authorization = String(req.headers.authorization || '');
  if (!authorization.startsWith('Bearer ')) return null;
  const token = authorization.slice(7).trim();
  if (!token) return null;
  await db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
  const row = await db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?`).get(tokenHash(token), new Date().toISOString());
  return row || null;
}

export async function requireUser(req, db, role) {
  const user = await currentUser(req, db);
  if (!user) throw new AppError(401, 'Please sign in to continue.');
  if (role && user.role !== role) throw new AppError(403, `${role === 'teacher' ? 'Teacher' : 'Student'} access is required.`);
  return user;
}
