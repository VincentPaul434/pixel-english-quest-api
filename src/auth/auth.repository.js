import { hashPassword, publicUser, tokenHash, uniqueId, verifyPassword } from '../config/database.js';

export async function findUserByEmail(db, email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

export async function findUserById(db, id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export async function createUser(db, { name, email, password, role }) {
  const id = uniqueId('user');
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, email, hashPassword(password), name, role, now);
  if (role === 'student') {
    const enroll = db.prepare('INSERT OR IGNORE INTO enrollments (user_id, course_id, enrolled_at) VALUES (?, ?, ?)');
    const courses = await db.prepare("SELECT id FROM courses WHERE status = 'published'").all();
    await Promise.all(courses.map((course) => enroll.run(id, course.id, now)));
  }
  return findUserById(db, id);
}

export async function updatePassword(db, userId, password) {
  await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), userId);
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function passwordMatches(password, passwordHash) {
  return verifyPassword(password, passwordHash);
}

export async function deleteSessionByToken(db, token) {
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
}

export function toPublicUser(user) {
  return publicUser(user);
}
