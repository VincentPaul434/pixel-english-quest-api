import { inTransaction, uniqueId } from '../config/database.js';

export async function updateProfile(db, userId, { name, proficiency, learningGoal, dailyGoal }) {
  await db.prepare(`UPDATE users SET name = ?, proficiency = ?, learning_goal = ?, daily_goal = ?, onboarding_complete = 1 WHERE id = ?`)
    .run(name, proficiency, learningGoal, dailyGoal, userId);
}

export async function findUserById(db, userId) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
}

export async function resetStudentProgress(db, userId) {
  await inTransaction(db, async (transaction) => {
    for (const table of ['lesson_attempts', 'progress', 'quick_attempts', 'vocabulary', 'speaking_attempts', 'activities']) {
      await transaction.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
    }
    await transaction.prepare("UPDATE assignment_students SET status = 'assigned', completed_at = NULL WHERE student_id = ?").run(userId);
    await transaction.prepare('UPDATE users SET xp = 0 WHERE id = ?').run(userId);
  });
}

export async function hasAwardedQuickQuizToday(db, userId, questionId, today) {
  return Boolean(await db.prepare(`SELECT id FROM quick_attempts WHERE user_id = ? AND question_id = ? AND award_date = ? AND xp_awarded > 0`)
    .get(userId, questionId, today));
}

export async function saveQuickQuizAttempt(db, { userId, question, answer, correct, xpAwarded, today, activity }) {
  await inTransaction(db, async (transaction) => {
    await transaction.prepare(`INSERT INTO quick_attempts (id, user_id, question_id, answer, correct, xp_awarded, award_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(uniqueId('quick'), userId, question.id, answer, correct ? 1 : 0, xpAwarded, today, new Date().toISOString());
    if (xpAwarded) await transaction.prepare('UPDATE users SET xp = xp + ? WHERE id = ?').run(xpAwarded, userId);
    await transaction.prepare(`INSERT INTO activities (id, user_id, type, icon, title, detail, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(uniqueId('activity'), userId, activity.type, activity.icon, activity.title, activity.detail, new Date().toISOString());
  });
}

export async function createVocabularyItem(db, userId, { term, definition }) {
  const item = { id: uniqueId('word'), term, definition, createdAt: new Date().toISOString() };
  await db.prepare('INSERT INTO vocabulary (id, user_id, term, definition, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(item.id, userId, term, definition, item.createdAt);
  return item;
}

export async function deleteVocabularyItem(db, userId, id) {
  await db.prepare('DELETE FROM vocabulary WHERE id = ? AND user_id = ?').run(id, userId);
}

export async function addActivity(db, userId, activity) {
  await db.prepare(`INSERT INTO activities (id, user_id, type, icon, title, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(uniqueId('activity'), userId, activity.type, activity.icon || 'sparkle', activity.title, activity.detail, new Date().toISOString());
}
