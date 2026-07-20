import { inTransaction, uniqueId } from '../config/database.js';
import { HttpError } from '../shared/http.js';

export function requireOwnedCourse(db, courseId, teacherId) {
  const course = db.prepare('SELECT * FROM courses WHERE id = ? AND teacher_id = ?').get(courseId, teacherId);
  if (!course) throw new HttpError(404, 'Course not found.');
  return course;
}

export function requireOwnedLesson(db, lessonId, teacherId) {
  const lesson = db.prepare(`SELECT l.*, c.teacher_id, c.title AS course_title, m.title AS module_title
    FROM lessons l JOIN courses c ON c.id = l.course_id LEFT JOIN modules m ON m.id = l.module_id
    WHERE l.id = ? AND c.teacher_id = ?`).get(lessonId, teacherId);
  if (!lesson) throw new HttpError(404, 'Lesson not found.');
  return lesson;
}

export function findModuleInCourse(db, moduleId, courseId) {
  return db.prepare('SELECT id FROM modules WHERE id = ? AND course_id = ?').get(moduleId, courseId);
}

export function countPublishedLessonsForCourse(db, courseId) {
  return db.prepare("SELECT COUNT(*) AS count FROM lessons WHERE course_id = ? AND status = 'published'").get(courseId).count;
}

export function countModulesForCourse(db, courseId) {
  return db.prepare('SELECT COUNT(*) AS count FROM modules WHERE course_id = ?').get(courseId).count;
}

export function insertCourse(db, teacherId, input) {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO courses (id, teacher_id, title, description, difficulty, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`)
    .run(uniqueId('course'), teacherId, input.title, input.description, input.difficulty, now, now);
}

export function updateCourse(db, courseId, input) {
  db.prepare('UPDATE courses SET title = ?, description = ?, difficulty = ?, status = ?, updated_at = ? WHERE id = ?')
    .run(input.title, input.description, input.difficulty, input.status, new Date().toISOString(), courseId);
}

export function enrollAllStudentsInCourse(db, courseId) {
  const now = new Date().toISOString();
  const enroll = db.prepare('INSERT OR IGNORE INTO enrollments (user_id, course_id, enrolled_at) VALUES (?, ?, ?)');
  db.prepare("SELECT id FROM users WHERE role = 'student'").all().forEach((student) => enroll.run(student.id, courseId, now));
}

export function insertModule(db, courseId, input, position) {
  db.prepare('INSERT INTO modules (id, course_id, title, position) VALUES (?, ?, ?, ?)')
    .run(uniqueId('module'), courseId, input.title, position);
}

export function insertLesson(db, input, saveLessonQuestions) {
  const id = uniqueId('lesson');
  const now = new Date().toISOString();
  inTransaction(db, () => {
    db.prepare(`INSERT INTO lessons
      (id, course_id, module_id, title, category, eyebrow, icon, minutes, difficulty, passage, audio_text, speak_phrase,
       audio_url, video_url, resource_url, objectives_json, xp_reward, mastery_score, position, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, input.courseId, input.moduleId, input.title, input.category, input.eyebrow, input.icon,
        input.minutes, input.difficulty, input.passage, input.audioText, input.speakPhrase, input.audioUrl, input.videoUrl, input.resourceUrl,
        JSON.stringify(input.objectives), input.xpReward, input.masteryScore, input.position, input.status, now, now);
    saveLessonQuestions(id);
  });
  return id;
}

export function updateLesson(db, lessonId, input, saveLessonQuestions) {
  const now = new Date().toISOString();
  inTransaction(db, () => {
    db.prepare(`UPDATE lessons SET course_id = ?, module_id = ?, title = ?, category = ?, eyebrow = ?, icon = ?, minutes = ?,
      difficulty = ?, passage = ?, audio_text = ?, speak_phrase = ?, audio_url = ?, video_url = ?, resource_url = ?, objectives_json = ?, xp_reward = ?, mastery_score = ?,
      position = ?, status = ?, updated_at = ? WHERE id = ?`)
      .run(input.courseId, input.moduleId, input.title, input.category, input.eyebrow, input.icon, input.minutes,
        input.difficulty, input.passage, input.audioText, input.speakPhrase, input.audioUrl, input.videoUrl, input.resourceUrl, JSON.stringify(input.objectives), input.xpReward,
        input.masteryScore, input.position, input.status, now, lessonId);
    saveLessonQuestions(lessonId);
  });
}

export function archiveLesson(db, lessonId) {
  db.prepare("UPDATE lessons SET status = 'archived', updated_at = ? WHERE id = ?").run(new Date().toISOString(), lessonId);
}

export function publishLesson(db, lessonId) {
  db.prepare("UPDATE lessons SET status = 'published', updated_at = ? WHERE id = ?").run(new Date().toISOString(), lessonId);
}

export function eligibleStudentIdsForCourse(db, courseId) {
  return db.prepare(`SELECT DISTINCT u.id FROM users u JOIN enrollments e ON e.user_id = u.id
    WHERE e.course_id = ? AND u.role = 'student'`).all(courseId).map((row) => row.id);
}

export function insertAssignment(db, teacherId, lesson, input) {
  const assignmentId = uniqueId('assignment');
  const now = new Date().toISOString();
  inTransaction(db, () => {
    db.prepare(`INSERT INTO assignments (id, teacher_id, course_id, lesson_id, title, due_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(assignmentId, teacherId, lesson.course_id, lesson.id, input.title, input.dueAt, now);
    const insert = db.prepare('INSERT INTO assignment_students (assignment_id, student_id) VALUES (?, ?)');
    input.studentIds.forEach((studentId) => insert.run(assignmentId, studentId));
  });
}

export function lessonAttempts(db, lessonId) {
  return db.prepare(`SELECT la.id, u.id AS studentId, u.name AS studentName, la.score, la.passed,
    la.correct_count AS correct, la.total_count AS total, la.duration_seconds AS durationSeconds, la.created_at AS createdAt
    FROM lesson_attempts la JOIN users u ON u.id = la.user_id WHERE la.lesson_id = ? ORDER BY la.created_at DESC`).all(lessonId);
}

export function lessonAttemptAnswers(db, attemptId) {
  return db.prepare('SELECT answers_json FROM lesson_attempts WHERE id = ?').get(attemptId);
}

export function insertAnnouncement(db, teacherId, courseId, input) {
  db.prepare('INSERT INTO announcements (id, teacher_id, course_id, title, body, published_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uniqueId('announcement'), teacherId, courseId, input.title, input.body, new Date().toISOString());
}
