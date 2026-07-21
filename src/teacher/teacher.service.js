import { teacherDashboard } from '../dashboard/dashboard.service.js';
import { lessonFromRow, normalizeLesson, normalizeQuestions } from '../lesson/lesson.service.js';
import { lessonQuestions, saveQuestions } from '../lesson/lesson.repository.js';
import { HttpError } from '../shared/http.js';
import { parseJson } from '../shared/data-utils.js';
import {
  archiveLesson,
  countModulesForCourse,
  countPublishedLessonsForCourse,
  enrollAllStudentsInCourse,
  eligibleStudentIdsForCourse,
  findModuleInCourse,
  insertAnnouncement,
  insertAssignment,
  insertCourse,
  insertLesson,
  insertModule,
  lessonAttemptAnswers,
  lessonAttempts,
  publishLesson,
  requireOwnedCourse,
  requireOwnedLesson,
  updateCourse,
  updateLesson
} from './teacher.repository.js';
import {
  validateAnnouncement,
  validateAssignment,
  validateCourseCreate,
  validateCourseUpdate,
  validateModuleCreate
} from './teacher.validator.js';

async function ensureModuleBelongsToCourse(db, moduleId, courseId) {
  if (moduleId && !await findModuleInCourse(db, moduleId, courseId)) {
    throw new HttpError(400, 'Module does not belong to this course.');
  }
}

async function dashboardFor(db, teacher) {
  return teacherDashboard(db, teacher);
}

export async function createTeacherCourse(db, teacher, body) {
  await insertCourse(db, teacher.id, validateCourseCreate(body));
  return dashboardFor(db, teacher);
}

export async function updateTeacherCourse(db, teacher, courseId, body) {
  const course = await requireOwnedCourse(db, courseId, teacher.id);
  const input = validateCourseUpdate(body, course);
  if (input.status === 'published' && await countPublishedLessonsForCourse(db, course.id) === 0) {
    throw new HttpError(400, 'Publish at least one lesson before publishing the course.');
  }
  await updateCourse(db, course.id, input);
  if (input.status === 'published') await enrollAllStudentsInCourse(db, course.id);
  return dashboardFor(db, teacher);
}

export async function createTeacherModule(db, teacher, courseId, body) {
  const course = await requireOwnedCourse(db, courseId, teacher.id);
  await insertModule(db, course.id, validateModuleCreate(body), await countModulesForCourse(db, course.id));
  return dashboardFor(db, teacher);
}

export async function createTeacherLesson(db, teacher, body) {
  const input = normalizeLesson(body, body.status === 'published');
  const course = await requireOwnedCourse(db, input.courseId, teacher.id);
  await ensureModuleBelongsToCourse(db, input.moduleId, course.id);
  const id = await insertLesson(db, input, (lessonId, transaction) => saveQuestions(transaction, lessonId, input.questions));
  return { lesson: await lessonFromRow(db, await requireOwnedLesson(db, id, teacher.id), true), dashboard: await dashboardFor(db, teacher) };
}

export async function updateTeacherLesson(db, teacher, lessonId, body) {
  const existing = await requireOwnedLesson(db, lessonId, teacher.id);
  const existingLesson = await lessonFromRow(db, existing, true);
  const merged = {
    ...existingLesson,
    ...body,
    courseId: body.courseId ?? existing.course_id,
    moduleId: body.moduleId === undefined ? existing.module_id : body.moduleId,
    questions: body.questions ?? await lessonQuestions(db, existing.id, true)
  };
  const input = normalizeLesson(merged, body.status === 'published');
  const course = await requireOwnedCourse(db, input.courseId, teacher.id);
  await ensureModuleBelongsToCourse(db, input.moduleId, course.id);
  await updateLesson(db, existing.id, input, (id, transaction) => saveQuestions(transaction, id, input.questions), teacher.id,
    { lesson: existingLesson, questions: existingLesson.questions });
  return { lesson: await lessonFromRow(db, await requireOwnedLesson(db, existing.id, teacher.id), true), dashboard: await dashboardFor(db, teacher) };
}

export async function archiveTeacherLesson(db, teacher, lessonId) {
  await archiveLesson(db, (await requireOwnedLesson(db, lessonId, teacher.id)).id);
  return dashboardFor(db, teacher);
}

export async function publishTeacherLesson(db, teacher, lessonId) {
  const lesson = await requireOwnedLesson(db, lessonId, teacher.id);
  normalizeQuestions(await lessonQuestions(db, lesson.id, true), true);
  if (lesson.category === 'listening' && !lesson.audio_text) throw new HttpError(400, 'Add an audio script before publishing.');
  if (lesson.category === 'speaking' && !lesson.speak_phrase) throw new HttpError(400, 'Add a speaking phrase before publishing.');
  await publishLesson(db, lesson.id);
  return dashboardFor(db, teacher);
}

export async function assignTeacherLesson(db, teacher, lessonId, body) {
  const lesson = await requireOwnedLesson(db, lessonId, teacher.id);
  if (lesson.status !== 'published') throw new HttpError(400, 'Publish the lesson before assigning it.');
  await insertAssignment(db, teacher.id, lesson, validateAssignment(body, await eligibleStudentIdsForCourse(db, lesson.course_id), lesson));
  return dashboardFor(db, teacher);
}

export async function getTeacherLessonAnalytics(db, teacher, lessonId) {
  const lesson = await requireOwnedLesson(db, lessonId, teacher.id);
  const attempts = await lessonAttempts(db, lesson.id);
  const questionRows = await lessonQuestions(db, lesson.id, true);
  const questions = await Promise.all(questionRows.map(async (question, index) => {
    const answered = await Promise.all(attempts.map(async (attempt) => parseJson((await lessonAttemptAnswers(db, attempt.id)).answers_json, [])[index]));
    const correctCount = answered.filter((answer) => question.type === 'fill_blank'
      ? String(answer || '').trim().toLocaleLowerCase() === String(question.answer).trim().toLocaleLowerCase()
      : answer === question.answer).length;
    return { prompt: question.prompt, attempts: answered.length, correctRate: answered.length ? Math.round((correctCount / answered.length) * 100) : 0 };
  }));
  return {
    lesson: { id: lesson.id, title: lesson.title },
    attempts,
    summary: {
      attempts: attempts.length,
      averageScore: attempts.length ? Math.round(attempts.reduce((sum, item) => sum + item.score, 0) / attempts.length) : 0,
      passRate: attempts.length ? Math.round((attempts.filter((item) => item.passed).length / attempts.length) * 100) : 0
    },
    questions
  };
}

export async function createTeacherAnnouncement(db, teacher, body) {
  const input = validateAnnouncement(body);
  const course = await requireOwnedCourse(db, input.courseId, teacher.id);
  await insertAnnouncement(db, teacher.id, course.id, input);
  return dashboardFor(db, teacher);
}
