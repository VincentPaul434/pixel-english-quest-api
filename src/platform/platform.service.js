import { randomBytes } from 'node:crypto';
import { publicUser, uniqueId, inTransaction } from '../config/database.js';
import { cleanText, clampInteger, optionalIsoDate, parseJson } from '../shared/data-utils.js';
import { HttpError } from '../shared/http.js';
import { lessonFromRow } from '../lesson/lesson.service.js';
import { lessonQuestions, saveQuestions } from '../lesson/lesson.repository.js';
import { requireOwnedCourse, requireOwnedLesson } from '../teacher/teacher.repository.js';

function now() {
  return new Date().toISOString();
}

function bool(value) {
  return value ? 1 : 0;
}

async function audit(db, actorId, action, entityType, entityId, metadata = {}) {
  await db.prepare(`INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(uniqueId('audit'), actorId, action, entityType, entityId || null, JSON.stringify(metadata), now());
}

async function notify(db, userId, type, title, body, link = null) {
  await db.prepare(`INSERT INTO notifications (id, user_id, type, title, body, link, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(uniqueId('notification'), userId, type, title, body, link, now());
}

async function courseAccess(db, user, courseId) {
  if (user.role === 'teacher') {
    return db.prepare('SELECT * FROM courses WHERE id = ? AND teacher_id = ?').get(courseId, user.id);
  }
  return db.prepare(`SELECT c.* FROM courses c JOIN enrollments e ON e.course_id = c.id
    WHERE c.id = ? AND e.user_id = ?`).get(courseId, user.id);
}

async function commonOverview(db, user) {
  const [notifications, events, discussions] = await Promise.all([
    db.prepare(`SELECT id, type, title, body, link, read_at AS readAt, created_at AS createdAt
      FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30`).all(user.id),
    db.prepare(`SELECT DISTINCT ce.id, ce.course_id AS courseId, ce.classroom_id AS classroomId,
      ce.title, ce.description, ce.starts_at AS startsAt, ce.ends_at AS endsAt, ce.event_type AS eventType,
      c.title AS courseTitle
      FROM calendar_events ce LEFT JOIN courses c ON c.id = ce.course_id
      LEFT JOIN enrollments e ON e.course_id = ce.course_id AND e.user_id = ?
      WHERE ce.creator_id = ? OR e.user_id = ?
      ORDER BY ce.starts_at LIMIT 50`).all(user.id, user.id, user.id),
    db.prepare(`SELECT DISTINCT d.id, d.course_id AS courseId, d.parent_id AS parentId, d.body,
      d.created_at AS createdAt, d.edited_at AS editedAt, u.id AS authorId, u.name AS authorName,
      c.title AS courseTitle
      FROM discussions d JOIN users u ON u.id = d.author_id JOIN courses c ON c.id = d.course_id
      LEFT JOIN enrollments e ON e.course_id = c.id AND e.user_id = ?
      WHERE c.teacher_id = ? OR e.user_id = ?
      ORDER BY d.created_at DESC LIMIT 50`).all(user.id, user.id, user.id)
  ]);
  return { notifications, events, discussions, unreadNotifications: notifications.filter((item) => !item.readAt).length };
}

async function studentOverview(db, user) {
  const [catalog, classrooms, submissions, certificates] = await Promise.all([
    catalogCourses(db, user),
    db.prepare(`SELECT cl.id, cl.name, cl.code, cl.starts_at AS startsAt, cl.ends_at AS endsAt,
      c.id AS courseId, c.title AS courseTitle, u.name AS teacherName
      FROM classrooms cl JOIN classroom_students cs ON cs.classroom_id = cl.id
      JOIN courses c ON c.id = cl.course_id JOIN users u ON u.id = cl.teacher_id
      WHERE cs.student_id = ? ORDER BY cl.created_at DESC`).all(user.id),
    db.prepare(`SELECT s.id, s.assignment_id AS assignmentId, s.text_content AS textContent,
      s.attachment_url AS attachmentUrl, s.status, s.score, s.feedback, s.rubric_json AS rubric,
      s.submitted_at AS submittedAt, s.graded_at AS gradedAt, s.attempt_number AS attemptNumber,
      a.title AS assignmentTitle, a.max_score AS maxScore, c.title AS courseTitle
      FROM submissions s JOIN assignments a ON a.id = s.assignment_id JOIN courses c ON c.id = a.course_id
      WHERE s.student_id = ? ORDER BY s.submitted_at DESC`).all(user.id),
    db.prepare(`SELECT cert.id, cert.verification_code AS verificationCode, cert.issued_at AS issuedAt,
      c.id AS courseId, c.title AS courseTitle
      FROM certificates cert JOIN courses c ON c.id = cert.course_id
      WHERE cert.user_id = ? ORDER BY cert.issued_at DESC`).all(user.id)
  ]);
  submissions.forEach((item) => { item.rubric = parseJson(item.rubric, []); });
  return { catalog, classrooms, submissions, certificates };
}

async function teacherOverview(db, user) {
  const [classrooms, submissions, questionBank, versions] = await Promise.all([
    db.prepare(`SELECT cl.id, cl.name, cl.code, cl.course_id AS courseId, c.title AS courseTitle,
      cl.starts_at AS startsAt, cl.ends_at AS endsAt,
      (SELECT COUNT(*) FROM classroom_students cs WHERE cs.classroom_id = cl.id) AS studentCount
      FROM classrooms cl JOIN courses c ON c.id = cl.course_id
      WHERE cl.teacher_id = ? ORDER BY cl.created_at DESC`).all(user.id),
    db.prepare(`SELECT s.id, s.assignment_id AS assignmentId, s.student_id AS studentId,
      s.text_content AS textContent, s.attachment_url AS attachmentUrl, s.status, s.score, s.feedback,
      s.rubric_json AS rubric, s.submitted_at AS submittedAt, s.graded_at AS gradedAt,
      s.attempt_number AS attemptNumber, a.title AS assignmentTitle, a.max_score AS maxScore,
      u.name AS studentName, u.email AS studentEmail, c.title AS courseTitle
      FROM submissions s JOIN assignments a ON a.id = s.assignment_id
      JOIN users u ON u.id = s.student_id JOIN courses c ON c.id = a.course_id
      WHERE a.teacher_id = ? ORDER BY s.submitted_at DESC`).all(user.id),
    db.prepare(`SELECT id, prompt, type, choices_json AS choices, answer_json AS answer, explanation,
      tags_json AS tags, created_at AS createdAt, updated_at AS updatedAt
      FROM question_bank WHERE teacher_id = ? ORDER BY updated_at DESC`).all(user.id),
    db.prepare(`SELECT lv.id, lv.lesson_id AS lessonId, lv.version, lv.created_at AS createdAt, l.title AS lessonTitle
      FROM lesson_versions lv JOIN lessons l ON l.id = lv.lesson_id
      WHERE lv.teacher_id = ? ORDER BY lv.created_at DESC LIMIT 50`).all(user.id)
  ]);
  submissions.forEach((item) => { item.rubric = parseJson(item.rubric, []); });
  questionBank.forEach((item) => {
    item.choices = parseJson(item.choices, []);
    item.answer = parseJson(item.answer);
    item.tags = parseJson(item.tags, []);
  });
  const rosters = await Promise.all(classrooms.map(async (classroom) => ({
    classroomId: classroom.id,
    students: await db.prepare(`SELECT u.id, u.name, u.email, u.proficiency, cs.enrolled_at AS enrolledAt
      FROM classroom_students cs JOIN users u ON u.id = cs.student_id
      WHERE cs.classroom_id = ? ORDER BY u.name`).all(classroom.id)
  })));
  return { classrooms, rosters, submissions, questionBank, lessonVersions: versions };
}

export async function platformOverview(db, user) {
  return {
    profile: publicUser(user),
    ...await commonOverview(db, user),
    ...(user.role === 'student' ? await studentOverview(db, user) : await teacherOverview(db, user)),
    ...(user.is_admin ? { admin: await adminSummary(db) } : {})
  };
}

export async function catalogCourses(db, user) {
  const rows = await db.prepare(`SELECT c.id, c.title, c.description, c.difficulty, c.enrollment_mode AS enrollmentMode,
    c.prerequisite_course_id AS prerequisiteCourseId, u.name AS teacherName,
    (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id AND l.status = 'published') AS lessonCount,
    (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS studentCount,
    (SELECT COUNT(*) FROM enrollments own WHERE own.course_id = c.id AND own.user_id = ?) AS enrolled
    FROM courses c JOIN users u ON u.id = c.teacher_id
    WHERE c.status = 'published' AND c.catalog_visibility = 'public'
    ORDER BY c.created_at DESC`).all(user?.id || '');
  return rows.map((row) => ({ ...row, enrolled: Boolean(row.enrolled) }));
}

export async function selfEnroll(db, user, courseId) {
  if (user.role !== 'student') throw new HttpError(403, 'Student access is required.');
  const course = await db.prepare(`SELECT * FROM courses WHERE id = ? AND status = 'published'
    AND catalog_visibility = 'public' AND enrollment_mode = 'self'`).get(courseId);
  if (!course) throw new HttpError(404, 'This course is not open for self-enrollment.');
  if (course.prerequisite_course_id) {
    const prerequisite = await db.prepare(`SELECT COUNT(*) AS remaining FROM lessons l
      WHERE l.course_id = ? AND l.status = 'published' AND NOT EXISTS
      (SELECT 1 FROM progress p WHERE p.lesson_id = l.id AND p.user_id = ? AND p.status = 'completed')`)
      .get(course.prerequisite_course_id, user.id);
    if (prerequisite.remaining > 0) throw new HttpError(400, 'Complete the prerequisite course first.');
  }
  await db.prepare('INSERT OR IGNORE INTO enrollments (user_id, course_id, enrolled_at) VALUES (?, ?, ?)')
    .run(user.id, course.id, now());
  await notify(db, user.id, 'enrollment', 'Course enrollment confirmed', `You joined ${course.title}.`, `/courses/${course.id}`);
  await audit(db, user.id, 'self_enroll', 'course', course.id);
  return platformOverview(db, user);
}

export async function markNotificationRead(db, user, notificationId) {
  await db.prepare('UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?')
    .run(now(), notificationId, user.id);
  return platformOverview(db, user);
}

export async function markAllNotificationsRead(db, user) {
  await db.prepare('UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE user_id = ?').run(now(), user.id);
  return platformOverview(db, user);
}

export async function listCourseDiscussions(db, user, courseId) {
  if (!await courseAccess(db, user, courseId)) throw new HttpError(403, 'You do not have access to this course.');
  return db.prepare(`SELECT d.id, d.parent_id AS parentId, d.body, d.created_at AS createdAt,
    d.edited_at AS editedAt, u.id AS authorId, u.name AS authorName
    FROM discussions d JOIN users u ON u.id = d.author_id
    WHERE d.course_id = ? ORDER BY d.created_at`).all(courseId);
}

export async function createDiscussion(db, user, courseId, body) {
  if (!await courseAccess(db, user, courseId)) throw new HttpError(403, 'You do not have access to this course.');
  const message = cleanText(body.body, 5000);
  const parentId = cleanText(body.parentId, 100) || null;
  if (!message) throw new HttpError(400, 'Write a discussion message first.');
  if (parentId && !await db.prepare('SELECT id FROM discussions WHERE id = ? AND course_id = ?').get(parentId, courseId)) {
    throw new HttpError(400, 'The parent discussion was not found.');
  }
  const id = uniqueId('discussion');
  await db.prepare(`INSERT INTO discussions (id, course_id, author_id, parent_id, body, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(id, courseId, user.id, parentId, message, now());
  const recipients = await db.prepare(`SELECT user_id AS id FROM enrollments WHERE course_id = ? AND user_id != ?
    UNION SELECT teacher_id AS id FROM courses WHERE id = ? AND teacher_id != ?`).all(courseId, user.id, courseId, user.id);
  await Promise.all(recipients.map((recipient) => notify(db, recipient.id, 'discussion', `${user.name} posted in a course discussion`, message.slice(0, 180), `/courses/${courseId}/discussion`)));
  await audit(db, user.id, 'create', 'discussion', id, { courseId });
  return listCourseDiscussions(db, user, courseId);
}

export async function submitAssignment(db, user, assignmentId, body) {
  if (user.role !== 'student') throw new HttpError(403, 'Student access is required.');
  const assignment = await db.prepare(`SELECT a.*, ast.student_id FROM assignments a
    JOIN assignment_students ast ON ast.assignment_id = a.id
    WHERE a.id = ? AND ast.student_id = ?`).get(assignmentId, user.id);
  if (!assignment) throw new HttpError(404, 'Assignment not found.');
  const textContent = cleanText(body.textContent, 20000);
  const attachmentUrl = cleanText(body.attachmentUrl, 2000) || null;
  if (assignment.submission_type !== 'quiz' && !textContent && !attachmentUrl) {
    throw new HttpError(400, 'Add written work or an attachment before submitting.');
  }
  const previous = await db.prepare(`SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ?
    ORDER BY attempt_number DESC LIMIT 1`).get(assignment.id, user.id);
  if (previous && !assignment.allow_resubmission) throw new HttpError(409, 'This assignment does not allow resubmission.');
  const id = uniqueId('submission');
  await db.prepare(`INSERT INTO submissions
    (id, assignment_id, student_id, text_content, attachment_url, status, submitted_at, attempt_number)
    VALUES (?, ?, ?, ?, ?, 'submitted', ?, ?)`)
    .run(id, assignment.id, user.id, textContent, attachmentUrl, now(), (previous?.attempt_number || 0) + 1);
  await notify(db, assignment.teacher_id, 'submission', `${user.name} submitted ${assignment.title}`, 'A submission is ready to grade.', `/teacher/grading/${id}`);
  await audit(db, user.id, 'submit', 'assignment', assignment.id, { submissionId: id });
  return platformOverview(db, user);
}

export async function createClassroom(db, teacher, body) {
  const courseId = cleanText(body.courseId, 100);
  const course = await requireOwnedCourse(db, courseId, teacher.id);
  const name = cleanText(body.name, 120);
  if (!name) throw new HttpError(400, 'Classroom name is required.');
  const classroomId = uniqueId('classroom');
  const code = randomBytes(4).toString('hex').toUpperCase();
  await db.prepare(`INSERT INTO classrooms (id, teacher_id, course_id, name, code, starts_at, ends_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(classroomId, teacher.id, course.id, name, code, optionalIsoDate(body.startsAt), optionalIsoDate(body.endsAt), now());
  await audit(db, teacher.id, 'create', 'classroom', classroomId, { courseId: course.id });
  return platformOverview(db, teacher);
}

async function ownedClassroom(db, teacherId, classroomId) {
  const classroom = await db.prepare('SELECT * FROM classrooms WHERE id = ? AND teacher_id = ?').get(classroomId, teacherId);
  if (!classroom) throw new HttpError(404, 'Classroom not found.');
  return classroom;
}

export async function addClassroomStudent(db, teacher, classroomId, studentId) {
  const classroom = await ownedClassroom(db, teacher.id, classroomId);
  const student = await db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(studentId);
  if (!student) throw new HttpError(404, 'Student not found.');
  await inTransaction(db, async (transaction) => {
    await transaction.prepare('INSERT OR IGNORE INTO classroom_students (classroom_id, student_id, enrolled_at) VALUES (?, ?, ?)')
      .run(classroom.id, student.id, now());
    await transaction.prepare('INSERT OR IGNORE INTO enrollments (user_id, course_id, enrolled_at) VALUES (?, ?, ?)')
      .run(student.id, classroom.course_id, now());
  });
  await notify(db, student.id, 'classroom', `You joined ${classroom.name}`, 'Your classroom and course are ready.', `/classrooms/${classroom.id}`);
  await audit(db, teacher.id, 'add_student', 'classroom', classroom.id, { studentId: student.id });
  return platformOverview(db, teacher);
}

export async function removeClassroomStudent(db, teacher, classroomId, studentId) {
  const classroom = await ownedClassroom(db, teacher.id, classroomId);
  await db.prepare('DELETE FROM classroom_students WHERE classroom_id = ? AND student_id = ?').run(classroom.id, studentId);
  await audit(db, teacher.id, 'remove_student', 'classroom', classroom.id, { studentId });
  return platformOverview(db, teacher);
}

export async function gradeSubmission(db, teacher, submissionId, body) {
  const submission = await db.prepare(`SELECT s.*, a.teacher_id, a.title AS assignment_title, a.max_score
    FROM submissions s JOIN assignments a ON a.id = s.assignment_id
    WHERE s.id = ? AND a.teacher_id = ?`).get(submissionId, teacher.id);
  if (!submission) throw new HttpError(404, 'Submission not found.');
  const score = clampInteger(body.score, 0, submission.max_score, 0);
  const feedback = cleanText(body.feedback, 10000);
  const rubric = Array.isArray(body.rubric) ? body.rubric.slice(0, 30).map((item) => ({
    criterion: cleanText(item.criterion, 200), points: clampInteger(item.points, 0, submission.max_score, 0),
    comment: cleanText(item.comment, 1000)
  })).filter((item) => item.criterion) : [];
  await inTransaction(db, async (transaction) => {
    await transaction.prepare(`UPDATE submissions SET status = 'graded', score = ?, feedback = ?, rubric_json = ?, graded_at = ?, graded_by = ?
      WHERE id = ?`).run(score, feedback, JSON.stringify(rubric), now(), teacher.id, submission.id);
    await transaction.prepare(`UPDATE assignment_students SET status = 'completed', completed_at = ?
      WHERE assignment_id = ? AND student_id = ?`).run(now(), submission.assignment_id, submission.student_id);
  });
  await notify(db, submission.student_id, 'grade', `${submission.assignment_title} was graded`, `Score: ${score}/${submission.max_score}${feedback ? `. ${feedback.slice(0, 160)}` : ''}`, `/submissions/${submission.id}`);
  await audit(db, teacher.id, 'grade', 'submission', submission.id, { score });
  return platformOverview(db, teacher);
}

export async function createCalendarEvent(db, teacher, body) {
  const courseId = cleanText(body.courseId, 100) || null;
  const classroomId = cleanText(body.classroomId, 100) || null;
  if (courseId) await requireOwnedCourse(db, courseId, teacher.id);
  if (classroomId) await ownedClassroom(db, teacher.id, classroomId);
  const title = cleanText(body.title, 160);
  const startsAt = optionalIsoDate(body.startsAt);
  if (!title || !startsAt) throw new HttpError(400, 'Event title and start time are required.');
  const id = uniqueId('event');
  await db.prepare(`INSERT INTO calendar_events
    (id, course_id, classroom_id, creator_id, title, description, starts_at, ends_at, event_type, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, courseId, classroomId, teacher.id, title, cleanText(body.description, 3000), startsAt,
      optionalIsoDate(body.endsAt), cleanText(body.eventType, 40) || 'class', now());
  const recipients = courseId ? await db.prepare('SELECT user_id AS id FROM enrollments WHERE course_id = ?').all(courseId) : [];
  await Promise.all(recipients.map((recipient) => notify(db, recipient.id, 'calendar', title, `Scheduled for ${startsAt}.`, `/calendar/${id}`)));
  await audit(db, teacher.id, 'create', 'calendar_event', id);
  return platformOverview(db, teacher);
}

export async function markAttendance(db, teacher, eventId, body) {
  const event = await db.prepare('SELECT * FROM calendar_events WHERE id = ? AND creator_id = ?').get(eventId, teacher.id);
  if (!event) throw new HttpError(404, 'Calendar event not found.');
  const studentId = cleanText(body.studentId, 100);
  const status = ['present', 'absent', 'late', 'excused'].includes(body.status) ? body.status : 'present';
  if (!await db.prepare("SELECT id FROM users WHERE id = ? AND role = 'student'").get(studentId)) throw new HttpError(404, 'Student not found.');
  await db.prepare(`INSERT INTO attendance (event_id, student_id, status, note, marked_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(event_id, student_id) DO UPDATE SET status = excluded.status, note = excluded.note, marked_at = excluded.marked_at`)
    .run(event.id, studentId, status, cleanText(body.note, 1000), now());
  await audit(db, teacher.id, 'mark_attendance', 'calendar_event', event.id, { studentId, status });
  return platformOverview(db, teacher);
}

export async function addQuestionBankItem(db, teacher, body) {
  const prompt = cleanText(body.prompt, 500);
  const type = ['multiple_choice', 'true_false', 'fill_blank', 'essay', 'matching', 'ordering'].includes(body.type) ? body.type : 'multiple_choice';
  const choices = Array.isArray(body.choices) ? body.choices.slice(0, 20) : [];
  if (!prompt) throw new HttpError(400, 'Question prompt is required.');
  const id = uniqueId('bank-question');
  const timestamp = now();
  await db.prepare(`INSERT INTO question_bank
    (id, teacher_id, prompt, type, choices_json, answer_json, explanation, tags_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, teacher.id, prompt, type, JSON.stringify(choices), JSON.stringify(body.answer ?? ''),
      cleanText(body.explanation, 2000), JSON.stringify(Array.isArray(body.tags) ? body.tags.slice(0, 20).map((tag) => cleanText(tag, 60)).filter(Boolean) : []), timestamp, timestamp);
  await audit(db, teacher.id, 'create', 'question_bank', id);
  return platformOverview(db, teacher);
}

export async function duplicateLesson(db, teacher, lessonId) {
  const original = await requireOwnedLesson(db, lessonId, teacher.id);
  const questions = await lessonQuestions(db, original.id, true);
  const id = uniqueId('lesson');
  const timestamp = now();
  await inTransaction(db, async (transaction) => {
    await transaction.prepare(`INSERT INTO lessons
      (id, course_id, module_id, title, category, eyebrow, icon, minutes, difficulty, passage, audio_text, speak_phrase,
       audio_url, video_url, resource_url, objectives_json, xp_reward, mastery_score, attempt_limit, shuffle_questions,
       available_from, available_until, position, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`)
      .run(id, original.course_id, original.module_id, `${original.title} (Copy)`, original.category, original.eyebrow,
        original.icon, original.minutes, original.difficulty, original.passage, original.audio_text, original.speak_phrase,
        original.audio_url, original.video_url, original.resource_url, original.objectives_json, original.xp_reward,
        original.mastery_score, original.attempt_limit, original.shuffle_questions, original.available_from,
        original.available_until, original.position + 1, timestamp, timestamp);
    await saveQuestions(transaction, id, questions);
  });
  await audit(db, teacher.id, 'duplicate', 'lesson', id, { sourceLessonId: original.id });
  return { lesson: await lessonFromRow(db, await requireOwnedLesson(db, id, teacher.id), true) };
}

export async function reorderLessons(db, teacher, courseId, body) {
  await requireOwnedCourse(db, courseId, teacher.id);
  const lessonIds = Array.isArray(body.lessonIds) ? body.lessonIds.map(String).slice(0, 500) : [];
  await inTransaction(db, async (transaction) => {
    for (const [position, lessonId] of lessonIds.entries()) {
      await transaction.prepare('UPDATE lessons SET position = ?, updated_at = ? WHERE id = ? AND course_id = ?')
        .run(position, now(), lessonId, courseId);
    }
  });
  await audit(db, teacher.id, 'reorder', 'course_lessons', courseId, { lessonIds });
  return { ok: true };
}

export async function lessonVersions(db, teacher, lessonId) {
  await requireOwnedLesson(db, lessonId, teacher.id);
  const rows = await db.prepare(`SELECT id, version, snapshot_json AS snapshot, created_at AS createdAt
    FROM lesson_versions WHERE lesson_id = ? AND teacher_id = ? ORDER BY version DESC`).all(lessonId, teacher.id);
  return rows.map((row) => ({ ...row, snapshot: parseJson(row.snapshot, {}) }));
}

export async function restoreLessonVersion(db, teacher, lessonId, versionId) {
  await requireOwnedLesson(db, lessonId, teacher.id);
  const version = await db.prepare(`SELECT * FROM lesson_versions WHERE id = ? AND lesson_id = ? AND teacher_id = ?`)
    .get(versionId, lessonId, teacher.id);
  if (!version) throw new HttpError(404, 'Lesson version not found.');
  const snapshot = parseJson(version.snapshot_json, {});
  const lesson = snapshot.lesson;
  if (!lesson || !Array.isArray(snapshot.questions)) throw new HttpError(400, 'This lesson version is invalid.');
  await inTransaction(db, async (transaction) => {
    await transaction.prepare(`UPDATE lessons SET title = ?, category = ?, eyebrow = ?, icon = ?, minutes = ?, difficulty = ?,
      passage = ?, audio_text = ?, speak_phrase = ?, audio_url = ?, video_url = ?, resource_url = ?, objectives_json = ?,
      xp_reward = ?, mastery_score = ?, attempt_limit = ?, shuffle_questions = ?, available_from = ?, available_until = ?,
      status = 'draft', version = version + 1, updated_at = ? WHERE id = ?`)
      .run(lesson.title, lesson.category, lesson.eyebrow, lesson.icon, lesson.minutes, lesson.difficulty, lesson.passage,
        lesson.audioText, lesson.speakPhrase, lesson.audioUrl, lesson.videoUrl, lesson.resourceUrl,
        JSON.stringify(lesson.objectives || []), lesson.xpReward, lesson.masteryScore, lesson.attemptLimit || 0,
        bool(lesson.shuffleQuestions), lesson.availableFrom || null, lesson.availableUntil || null, now(), lessonId);
    await saveQuestions(transaction, lessonId, snapshot.questions);
  });
  await audit(db, teacher.id, 'restore_version', 'lesson', lessonId, { versionId });
  return { lesson: await lessonFromRow(db, await requireOwnedLesson(db, lessonId, teacher.id), true) };
}

export async function issueEligibleCertificates(db, userId) {
  const courses = await db.prepare(`SELECT c.* FROM courses c JOIN enrollments e ON e.course_id = c.id
    WHERE e.user_id = ? AND c.certificate_enabled = 1 AND c.status = 'published'
    AND NOT EXISTS (SELECT 1 FROM certificates cert WHERE cert.course_id = c.id AND cert.user_id = ?)`)
    .all(userId, userId);
  for (const course of courses) {
    const remaining = await db.prepare(`SELECT COUNT(*) AS count FROM lessons l WHERE l.course_id = ? AND l.status = 'published'
      AND NOT EXISTS (SELECT 1 FROM progress p WHERE p.lesson_id = l.id AND p.user_id = ? AND p.status = 'completed')`)
      .get(course.id, userId);
    const total = await db.prepare("SELECT COUNT(*) AS count FROM lessons WHERE course_id = ? AND status = 'published'").get(course.id);
    if (total.count > 0 && remaining.count === 0) {
      const id = uniqueId('certificate');
      const verificationCode = randomBytes(10).toString('hex').toUpperCase();
      await db.prepare(`INSERT INTO certificates (id, user_id, course_id, verification_code, issued_at)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, course_id) DO NOTHING`)
        .run(id, userId, course.id, verificationCode, now());
      await notify(db, userId, 'certificate', 'Certificate earned', `You completed ${course.title}.`, `/certificates/${verificationCode}`);
    }
  }
}

export async function verifyCertificate(db, code) {
  const certificate = await db.prepare(`SELECT cert.verification_code AS verificationCode, cert.issued_at AS issuedAt,
    u.name AS studentName, c.title AS courseTitle, t.name AS teacherName
    FROM certificates cert JOIN users u ON u.id = cert.user_id JOIN courses c ON c.id = cert.course_id
    JOIN users t ON t.id = c.teacher_id WHERE cert.verification_code = ?`).get(code);
  if (!certificate) throw new HttpError(404, 'Certificate not found.');
  return { valid: true, ...certificate };
}

export async function teacherReport(db, teacher) {
  const rows = await db.prepare(`SELECT c.title AS course, u.name AS student, u.email,
    COUNT(DISTINCT l.id) AS assignedLessons,
    COUNT(DISTINCT CASE WHEN p.status = 'completed' THEN p.lesson_id END) AS completedLessons,
    COALESCE(ROUND(AVG(CASE WHEN p.attempts > 0 THEN p.best_score END)), 0) AS averageScore
    FROM courses c JOIN enrollments e ON e.course_id = c.id JOIN users u ON u.id = e.user_id
    LEFT JOIN lessons l ON l.course_id = c.id AND l.status = 'published'
    LEFT JOIN progress p ON p.user_id = u.id AND p.lesson_id = l.id
    WHERE c.teacher_id = ? GROUP BY c.id, c.title, u.id, u.name, u.email ORDER BY c.title, u.name`).all(teacher.id);
  return rows;
}

export async function adminSummary(db) {
  const [users, courses, lessons, attempts, submissions] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS count FROM users').get(),
    db.prepare('SELECT COUNT(*) AS count FROM courses').get(),
    db.prepare('SELECT COUNT(*) AS count FROM lessons').get(),
    db.prepare('SELECT COUNT(*) AS count FROM lesson_attempts').get(),
    db.prepare('SELECT COUNT(*) AS count FROM submissions').get()
  ]);
  return { users: users.count, courses: courses.count, lessons: lessons.count, attempts: attempts.count, submissions: submissions.count };
}

export async function adminDashboard(db, admin) {
  if (!admin.is_admin) throw new HttpError(403, 'Administrator access is required.');
  const [summary, users, logs] = await Promise.all([
    adminSummary(db),
    db.prepare(`SELECT id, email, name, role, is_admin AS isAdmin, email_verified_at AS emailVerifiedAt,
      xp, created_at AS createdAt FROM users ORDER BY created_at DESC`).all(),
    db.prepare(`SELECT al.id, al.action, al.entity_type AS entityType, al.entity_id AS entityId,
      al.metadata_json AS metadata, al.created_at AS createdAt, u.name AS actorName
      FROM audit_logs al LEFT JOIN users u ON u.id = al.actor_id ORDER BY al.created_at DESC LIMIT 200`).all()
  ]);
  logs.forEach((log) => { log.metadata = parseJson(log.metadata, {}); });
  return { summary, users: users.map((item) => ({ ...item, isAdmin: Boolean(item.isAdmin) })), logs };
}

export async function setAdminStatus(db, admin, userId, body) {
  if (!admin.is_admin) throw new HttpError(403, 'Administrator access is required.');
  if (admin.id === userId && body.isAdmin === false) throw new HttpError(400, 'You cannot remove your own administrator access.');
  if (!await db.prepare('SELECT id FROM users WHERE id = ?').get(userId)) throw new HttpError(404, 'User not found.');
  await db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(bool(Boolean(body.isAdmin)), userId);
  await audit(db, admin.id, 'set_admin', 'user', userId, { isAdmin: Boolean(body.isAdmin) });
  return adminDashboard(db, admin);
}

export async function signUpload(_db, user, body) {
  const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'learning-assets';
  if (!supabaseUrl || !serviceKey) throw new HttpError(503, 'Cloud file storage is not configured.');
  const original = cleanText(body.filename, 240);
  const safeName = original.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+/, '').slice(0, 160);
  if (!safeName) throw new HttpError(400, 'A valid filename is required.');
  const path = `${user.id}/${Date.now()}-${randomBytes(5).toString('hex')}-${safeName}`;
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(`${supabaseUrl}/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${encodedPath}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ upsert: false })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpError(502, 'Could not prepare the cloud upload.');
  const returnedUrl = result.signedUrl || result.signedURL || result.url;
  const signedUrl = returnedUrl?.startsWith('http') ? returnedUrl
    : returnedUrl ? `${supabaseUrl}/storage/v1${returnedUrl.startsWith('/') ? '' : '/'}${returnedUrl}`
      : `${supabaseUrl}/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${encodedPath}?token=${encodeURIComponent(result.token || '')}`;
  return {
    path,
    signedUrl,
    token: result.token,
    publicUrl: `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}`
  };
}
