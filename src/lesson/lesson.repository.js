import { addActivity, inTransaction, uniqueId } from '../config/database.js';
import { parseJson } from '../shared/data-utils.js';

export async function ownedLesson(db, lessonId, teacherId) {
  return db.prepare(`SELECT l.*, c.teacher_id, c.title AS course_title, m.title AS module_title
    FROM lessons l JOIN courses c ON c.id = l.course_id LEFT JOIN modules m ON m.id = l.module_id
    WHERE l.id = ? AND c.teacher_id = ?`).get(lessonId, teacherId);
}

export async function publishedLessonRow(db, lessonId, userId) {
  return db.prepare(`SELECT l.*, c.title AS course_title, m.title AS module_title,
      p.status AS progress_status, p.best_score, p.last_score, p.attempts, p.last_question,
      p.draft_answers_json, p.bookmarked, p.notes
    FROM lessons l
    JOIN courses c ON c.id = l.course_id
    JOIN enrollments e ON e.course_id = c.id AND e.user_id = ?
    LEFT JOIN modules m ON m.id = l.module_id
    LEFT JOIN progress p ON p.lesson_id = l.id AND p.user_id = ?
    WHERE l.id = ? AND l.status = 'published' AND c.status = 'published'`).get(userId, userId, lessonId);
}

export async function lessonQuestions(db, lessonId, includeAnswers = false) {
  return (await db.prepare('SELECT * FROM questions WHERE lesson_id = ? ORDER BY position, id').all(lessonId)).map((row) => {
    const question = {
      id: row.id,
      prompt: row.prompt,
      type: row.question_kind || row.type,
      choices: parseJson(row.choices_json, []),
      points: row.points || 1,
      settings: parseJson(row.settings_json, {}),
      explanation: includeAnswers ? row.explanation : undefined
    };
    if (includeAnswers) question.answer = parseJson(row.answer_json);
    return question;
  });
}

export async function saveQuestions(db, lessonId, questions) {
  await db.prepare('DELETE FROM questions WHERE lesson_id = ?').run(lessonId);
  const statement = db.prepare(`INSERT INTO questions
    (id, lesson_id, prompt, type, choices_json, answer_json, explanation, question_kind, points, settings_json, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const [index, question] of questions.entries()) {
    const storedType = ['multiple_choice', 'true_false', 'fill_blank'].includes(question.type) ? question.type : 'fill_blank';
    await statement.run(uniqueId('question'), lessonId, question.prompt, storedType, JSON.stringify(question.choices),
      JSON.stringify(question.answer), question.explanation, question.type, question.points || 1,
      JSON.stringify(question.settings || {}), index);
  }
}

export async function findProgress(db, userId, lessonId) {
  return db.prepare('SELECT * FROM progress WHERE user_id = ? AND lesson_id = ?').get(userId, lessonId);
}

export async function findUserById(db, userId) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
}

export async function recordLessonAttempt(db, { user, lesson, answers, score, correct, total, passed, durationSeconds, firstCompletion, now }) {
  await inTransaction(db, async (transaction) => {
    await transaction.prepare(`INSERT INTO lesson_attempts
      (id, user_id, lesson_id, answers_json, score, correct_count, total_count, passed, duration_seconds, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(uniqueId('attempt'), user.id, lesson.id, JSON.stringify(answers), score, correct, total, passed ? 1 : 0, durationSeconds, now);
    await transaction.prepare(`INSERT INTO progress
      (user_id, lesson_id, status, best_score, last_score, attempts, last_question, draft_answers_json, bookmarked, notes, completed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, 0, '[]', 0, '', ?, ?)
      ON CONFLICT(user_id, lesson_id) DO UPDATE SET
        status = CASE WHEN progress.status = 'completed' OR excluded.status = 'completed' THEN 'completed' ELSE excluded.status END,
        best_score = MAX(progress.best_score, excluded.best_score), last_score = excluded.last_score,
        attempts = progress.attempts + 1, last_question = 0, draft_answers_json = '[]',
        completed_at = COALESCE(progress.completed_at, excluded.completed_at), updated_at = excluded.updated_at`)
      .run(user.id, lesson.id, passed ? 'completed' : 'in_progress', score, score, passed ? now : null, now);
    if (firstCompletion) await transaction.prepare('UPDATE users SET xp = xp + ? WHERE id = ?').run(lesson.xp_reward, user.id);
    if (passed) {
      await transaction.prepare(`UPDATE assignment_students SET status = 'completed', completed_at = ?
        WHERE student_id = ? AND assignment_id IN (SELECT id FROM assignments WHERE lesson_id = ?)`)
        .run(now, user.id, lesson.id);
    }
    await addActivity(transaction, user.id, {
      type: 'lesson',
      icon: lesson.icon,
      title: firstCompletion ? `Mastered ${lesson.title}` : passed ? `Practised ${lesson.title}` : `Attempted ${lesson.title}`,
      detail: `${score}% score - ${correct}/${total} correct${firstCompletion ? ` - +${lesson.xp_reward} XP` : passed ? '' : ' - Retry needed'}`
    });
  });
}

export async function saveCheckpoint(db, userId, lessonId, { lastQuestion, draftAnswers }) {
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO progress (user_id, lesson_id, status, last_question, draft_answers_json, updated_at)
    VALUES (?, ?, 'in_progress', ?, ?, ?)
    ON CONFLICT(user_id, lesson_id) DO UPDATE SET
      status = CASE WHEN progress.status = 'completed' THEN 'completed' ELSE 'in_progress' END,
      last_question = excluded.last_question, draft_answers_json = excluded.draft_answers_json, updated_at = excluded.updated_at`)
    .run(userId, lessonId, lastQuestion, JSON.stringify(draftAnswers), now);
  return { saved: true, updatedAt: now };
}

export async function saveStudyNotes(db, userId, lessonId, { notes, bookmarked }) {
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO progress (user_id, lesson_id, status, bookmarked, notes, updated_at)
    VALUES (?, ?, 'not_started', ?, ?, ?)
    ON CONFLICT(user_id, lesson_id) DO UPDATE SET bookmarked = excluded.bookmarked, notes = excluded.notes, updated_at = excluded.updated_at`)
    .run(userId, lessonId, bookmarked ? 1 : 0, notes, now);
  return { saved: true, bookmarked, notes };
}

export async function createSpeakingAttempt(db, userId, lessonId, transcript, accuracy) {
  await db.prepare(`INSERT INTO speaking_attempts (id, user_id, lesson_id, transcript, accuracy, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(uniqueId('speaking'), userId, lessonId, transcript, accuracy, new Date().toISOString());
}

export async function addLessonActivity(db, userId, activity) {
  await db.prepare(`INSERT INTO activities (id, user_id, type, icon, title, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(uniqueId('activity'), userId, activity.type, activity.icon || 'sparkle', activity.title, activity.detail, new Date().toISOString());
}
