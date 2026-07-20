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

function ensureModuleBelongsToCourse(db, moduleId, courseId) {
  if (moduleId && !findModuleInCourse(db, moduleId, courseId)) {
    throw new HttpError(400, 'Module does not belong to this course.');
  }
}

function dashboardFor(db, teacher) {
  return teacherDashboard(db, teacher);
}

export function createTeacherCourse(db, teacher, body) {
  insertCourse(db, teacher.id, validateCourseCreate(body));
  return dashboardFor(db, teacher);
}

export function updateTeacherCourse(db, teacher, courseId, body) {
  const course = requireOwnedCourse(db, courseId, teacher.id);
  const input = validateCourseUpdate(body, course);
  if (input.status === 'published' && countPublishedLessonsForCourse(db, course.id) === 0) {
    throw new HttpError(400, 'Publish at least one lesson before publishing the course.');
  }
  updateCourse(db, course.id, input);
  if (input.status === 'published') enrollAllStudentsInCourse(db, course.id);
  return dashboardFor(db, teacher);
}

export function createTeacherModule(db, teacher, courseId, body) {
  const course = requireOwnedCourse(db, courseId, teacher.id);
  insertModule(db, course.id, validateModuleCreate(body), countModulesForCourse(db, course.id));
  return dashboardFor(db, teacher);
}

export function createTeacherLesson(db, teacher, body) {
  const input = normalizeLesson(body, body.status === 'published');
  const course = requireOwnedCourse(db, input.courseId, teacher.id);
  ensureModuleBelongsToCourse(db, input.moduleId, course.id);
  const id = insertLesson(db, input, (lessonId) => saveQuestions(db, lessonId, input.questions));
  return { lesson: lessonFromRow(db, requireOwnedLesson(db, id, teacher.id), true), dashboard: dashboardFor(db, teacher) };
}

export function updateTeacherLesson(db, teacher, lessonId, body) {
  const existing = requireOwnedLesson(db, lessonId, teacher.id);
  const merged = {
    ...lessonFromRow(db, existing, true),
    ...body,
    courseId: body.courseId ?? existing.course_id,
    moduleId: body.moduleId === undefined ? existing.module_id : body.moduleId,
    questions: body.questions ?? lessonQuestions(db, existing.id, true)
  };
  const input = normalizeLesson(merged, body.status === 'published');
  const course = requireOwnedCourse(db, input.courseId, teacher.id);
  ensureModuleBelongsToCourse(db, input.moduleId, course.id);
  updateLesson(db, existing.id, input, (id) => saveQuestions(db, id, input.questions));
  return { lesson: lessonFromRow(db, requireOwnedLesson(db, existing.id, teacher.id), true), dashboard: dashboardFor(db, teacher) };
}

export function archiveTeacherLesson(db, teacher, lessonId) {
  archiveLesson(db, requireOwnedLesson(db, lessonId, teacher.id).id);
  return dashboardFor(db, teacher);
}

export function publishTeacherLesson(db, teacher, lessonId) {
  const lesson = requireOwnedLesson(db, lessonId, teacher.id);
  normalizeQuestions(lessonQuestions(db, lesson.id, true), true);
  if (lesson.category === 'listening' && !lesson.audio_text) throw new HttpError(400, 'Add an audio script before publishing.');
  if (lesson.category === 'speaking' && !lesson.speak_phrase) throw new HttpError(400, 'Add a speaking phrase before publishing.');
  publishLesson(db, lesson.id);
  return dashboardFor(db, teacher);
}

export function assignTeacherLesson(db, teacher, lessonId, body) {
  const lesson = requireOwnedLesson(db, lessonId, teacher.id);
  if (lesson.status !== 'published') throw new HttpError(400, 'Publish the lesson before assigning it.');
  insertAssignment(db, teacher.id, lesson, validateAssignment(body, eligibleStudentIdsForCourse(db, lesson.course_id), lesson));
  return dashboardFor(db, teacher);
}

export function getTeacherLessonAnalytics(db, teacher, lessonId) {
  const lesson = requireOwnedLesson(db, lessonId, teacher.id);
  const attempts = lessonAttempts(db, lesson.id);
  const questions = lessonQuestions(db, lesson.id, true).map((question, index) => {
    const answered = attempts.map((attempt) => parseJson(lessonAttemptAnswers(db, attempt.id).answers_json, [])[index]);
    const correctCount = answered.filter((answer) => question.type === 'fill_blank'
      ? String(answer || '').trim().toLocaleLowerCase() === String(question.answer).trim().toLocaleLowerCase()
      : answer === question.answer).length;
    return { prompt: question.prompt, attempts: answered.length, correctRate: answered.length ? Math.round((correctCount / answered.length) * 100) : 0 };
  });
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

export function createTeacherAnnouncement(db, teacher, body) {
  const input = validateAnnouncement(body);
  const course = requireOwnedCourse(db, input.courseId, teacher.id);
  insertAnnouncement(db, teacher.id, course.id, input);
  return dashboardFor(db, teacher);
}
