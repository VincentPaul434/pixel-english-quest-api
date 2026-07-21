import { inTransaction, uniqueId } from '../config/database.js';
import { HttpError } from '../shared/http.js';

export async function requireOwnedCourse(db, courseId, teacherId) {
  const course = await db.prepare('SELECT * FROM courses WHERE id = ? AND teacher_id = ?').get(courseId, teacherId);
  if (!course) throw new HttpError(404, 'Course not found.');
  return course;
}

export async function requireOwnedLesson(db, lessonId, teacherId) {
  const lesson = await db.prepare(`SELECT l.*, c.teacher_id, c.title AS course_title, m.title AS module_title
    FROM lessons l JOIN courses c ON c.id = l.course_id LEFT JOIN modules m ON m.id = l.module_id
    WHERE l.id = ? AND c.teacher_id = ?`).get(lessonId, teacherId);
  if (!lesson) throw new HttpError(404, 'Lesson not found.');
  return lesson;
}

export async function findModuleInCourse(db, moduleId, courseId) {
  return db.prepare('SELECT id FROM modules WHERE id = ? AND course_id = ?').get(moduleId, courseId);
}

export async function countPublishedLessonsForCourse(db, courseId) {
  return (await db.prepare("SELECT COUNT(*) AS count FROM lessons WHERE course_id = ? AND status = 'published'").get(courseId)).count;
}

export async function countModulesForCourse(db, courseId) {
  return (await db.prepare('SELECT COUNT(*) AS count FROM modules WHERE course_id = ?').get(courseId)).count;
}

export async function insertCourse(db, teacherId, input) {
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO courses (id, teacher_id, title, description, difficulty, status, catalog_visibility,
    enrollment_mode, certificate_enabled, prerequisite_course_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`)
    .run(uniqueId('course'), teacherId, input.title, input.description, input.difficulty, input.catalogVisibility,
      input.enrollmentMode, input.certificateEnabled ? 1 : 0, input.prerequisiteCourseId, now, now);
}

export async function updateCourse(db, courseId, input) {
  const timestamp = new Date().toISOString();
  await db.prepare(`UPDATE courses SET title = ?, description = ?, difficulty = ?, status = ?, catalog_visibility = ?,
    enrollment_mode = ?, certificate_enabled = ?, prerequisite_course_id = ?, published_at = CASE WHEN ? = 'published'
    THEN COALESCE(published_at, ?) ELSE published_at END, updated_at = ? WHERE id = ?`)
    .run(input.title, input.description, input.difficulty, input.status, input.catalogVisibility, input.enrollmentMode,
      input.certificateEnabled ? 1 : 0, input.prerequisiteCourseId, input.status, timestamp, timestamp, courseId);
}

export async function enrollAllStudentsInCourse(db, courseId) {
  const now = new Date().toISOString();
  const enroll = db.prepare('INSERT OR IGNORE INTO enrollments (user_id, course_id, enrolled_at) VALUES (?, ?, ?)');
  const students = await db.prepare("SELECT id FROM users WHERE role = 'student'").all();
  await Promise.all(students.map((student) => enroll.run(student.id, courseId, now)));
}

export async function insertModule(db, courseId, input, position) {
  await db.prepare('INSERT INTO modules (id, course_id, title, position) VALUES (?, ?, ?, ?)')
    .run(uniqueId('module'), courseId, input.title, position);
}

export async function insertLesson(db, input, saveLessonQuestions) {
  const id = uniqueId('lesson');
  const now = new Date().toISOString();
  await inTransaction(db, async (transaction) => {
    await transaction.prepare(`INSERT INTO lessons
      (id, course_id, module_id, title, category, eyebrow, icon, minutes, difficulty, passage, audio_text, speak_phrase,
       audio_url, video_url, resource_url, objectives_json, xp_reward, mastery_score, attempt_limit, shuffle_questions,
       available_from, available_until, publish_at, position, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, input.courseId, input.moduleId, input.title, input.category, input.eyebrow, input.icon,
        input.minutes, input.difficulty, input.passage, input.audioText, input.speakPhrase, input.audioUrl, input.videoUrl, input.resourceUrl,
        JSON.stringify(input.objectives), input.xpReward, input.masteryScore, input.attemptLimit, input.shuffleQuestions ? 1 : 0,
        input.availableFrom, input.availableUntil, input.publishAt, input.position, input.status, now, now);
    await saveLessonQuestions(id, transaction);
  });
  return id;
}

export async function updateLesson(db, lessonId, input, saveLessonQuestions, teacherId, snapshot) {
  const now = new Date().toISOString();
  await inTransaction(db, async (transaction) => {
    if (snapshot) {
      const current = await transaction.prepare('SELECT version FROM lessons WHERE id = ?').get(lessonId);
      await transaction.prepare(`INSERT INTO lesson_versions (id, lesson_id, teacher_id, version, snapshot_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(uniqueId('lesson-version'), lessonId, teacherId, current.version || 1, JSON.stringify(snapshot), now);
    }
    await transaction.prepare(`UPDATE lessons SET course_id = ?, module_id = ?, title = ?, category = ?, eyebrow = ?, icon = ?, minutes = ?,
      difficulty = ?, passage = ?, audio_text = ?, speak_phrase = ?, audio_url = ?, video_url = ?, resource_url = ?, objectives_json = ?, xp_reward = ?, mastery_score = ?,
      attempt_limit = ?, shuffle_questions = ?, available_from = ?, available_until = ?, publish_at = ?,
      position = ?, status = ?, version = version + 1, updated_at = ? WHERE id = ?`)
      .run(input.courseId, input.moduleId, input.title, input.category, input.eyebrow, input.icon, input.minutes,
        input.difficulty, input.passage, input.audioText, input.speakPhrase, input.audioUrl, input.videoUrl, input.resourceUrl, JSON.stringify(input.objectives), input.xpReward,
        input.masteryScore, input.attemptLimit, input.shuffleQuestions ? 1 : 0, input.availableFrom, input.availableUntil,
        input.publishAt, input.position, input.status, now, lessonId);
    await saveLessonQuestions(lessonId, transaction);
  });
}

export async function archiveLesson(db, lessonId) {
  await db.prepare("UPDATE lessons SET status = 'archived', updated_at = ? WHERE id = ?").run(new Date().toISOString(), lessonId);
}

export async function publishLesson(db, lessonId) {
  await db.prepare("UPDATE lessons SET status = 'published', updated_at = ? WHERE id = ?").run(new Date().toISOString(), lessonId);
}

export async function eligibleStudentIdsForCourse(db, courseId) {
  return (await db.prepare(`SELECT DISTINCT u.id FROM users u JOIN enrollments e ON e.user_id = u.id
    WHERE e.course_id = ? AND u.role = 'student'`).all(courseId)).map((row) => row.id);
}

export async function insertAssignment(db, teacherId, lesson, input) {
  const assignmentId = uniqueId('assignment');
  const now = new Date().toISOString();
  await inTransaction(db, async (transaction) => {
    await transaction.prepare(`INSERT INTO assignments (id, teacher_id, course_id, lesson_id, title, instructions,
      submission_type, max_score, allow_resubmission, due_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(assignmentId, teacherId, lesson.course_id, lesson.id, input.title, input.instructions, input.submissionType,
        input.maxScore, input.allowResubmission ? 1 : 0, input.dueAt, now);
    const insert = transaction.prepare('INSERT INTO assignment_students (assignment_id, student_id) VALUES (?, ?)');
    for (const studentId of input.studentIds) await insert.run(assignmentId, studentId);
  });
}

export async function lessonAttempts(db, lessonId) {
  return db.prepare(`SELECT la.id, u.id AS studentId, u.name AS studentName, la.score, la.passed,
    la.correct_count AS correct, la.total_count AS total, la.duration_seconds AS durationSeconds, la.created_at AS createdAt
    FROM lesson_attempts la JOIN users u ON u.id = la.user_id WHERE la.lesson_id = ? ORDER BY la.created_at DESC`).all(lessonId);
}

export async function lessonAttemptAnswers(db, attemptId) {
  return db.prepare('SELECT answers_json FROM lesson_attempts WHERE id = ?').get(attemptId);
}

export async function insertAnnouncement(db, teacherId, courseId, input) {
  await db.prepare('INSERT INTO announcements (id, teacher_id, course_id, title, body, published_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uniqueId('announcement'), teacherId, courseId, input.title, input.body, new Date().toISOString());
}
