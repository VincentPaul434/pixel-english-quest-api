import { hashPassword, publicUser, tokenHash, uniqueId, verifyPassword } from '../config/database.js';

export function findUserByEmail(db, email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

export function findUserById(db, id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function createUser(db, { name, email, password, role }) {
  const id = uniqueId('user');
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, email, hashPassword(password), name, role, now);
  if (role === 'student') {
    const enroll = db.prepare('INSERT OR IGNORE INTO enrollments (user_id, course_id, enrolled_at) VALUES (?, ?, ?)');
    db.prepare("SELECT id FROM courses WHERE status = 'published'").all().forEach((course) => enroll.run(id, course.id, now));
  }
  return findUserById(db, id);
}

export function passwordMatches(password, passwordHash) {
  return verifyPassword(password, passwordHash);
}

export function deleteSessionByToken(db, token) {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
}

export function toPublicUser(user) {
  return publicUser(user);
}
