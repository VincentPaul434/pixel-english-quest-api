import { requireUser } from '../shared/middleware/auth.middleware.js';
import { bodyOf, created, ok } from '../shared/http.js';
import {
  archiveTeacherLesson,
  assignTeacherLesson,
  createTeacherAnnouncement,
  createTeacherCourse,
  createTeacherLesson,
  createTeacherModule,
  getTeacherLessonAnalytics,
  publishTeacherLesson,
  updateTeacherCourse,
  updateTeacherLesson
} from './teacher.service.js';

export async function createCourse(context) {
  const teacher = requireUser(context.req, context.db, 'teacher');
  created(context, createTeacherCourse(context.db, teacher, await bodyOf(context.req)));
}

export async function updateCourse(context) {
  const teacher = requireUser(context.req, context.db, 'teacher');
  ok(context, updateTeacherCourse(context.db, teacher, context.params.id, await bodyOf(context.req)));
}

export async function createModule(context) {
  const teacher = requireUser(context.req, context.db, 'teacher');
  created(context, createTeacherModule(context.db, teacher, context.params.courseId, await bodyOf(context.req)));
}

export async function createLesson(context) {
  const teacher = requireUser(context.req, context.db, 'teacher');
  created(context, createTeacherLesson(context.db, teacher, await bodyOf(context.req)));
}

export async function updateLesson(context) {
  const teacher = requireUser(context.req, context.db, 'teacher');
  ok(context, updateTeacherLesson(context.db, teacher, context.params.id, await bodyOf(context.req)));
}

export async function archiveLesson(context) {
  const teacher = requireUser(context.req, context.db, 'teacher');
  ok(context, archiveTeacherLesson(context.db, teacher, context.params.id));
}

export async function publishLesson(context) {
  const teacher = requireUser(context.req, context.db, 'teacher');
  ok(context, publishTeacherLesson(context.db, teacher, context.params.id));
}

export async function assignLesson(context) {
  const teacher = requireUser(context.req, context.db, 'teacher');
  created(context, assignTeacherLesson(context.db, teacher, context.params.id, await bodyOf(context.req)));
}

export async function getLessonAnalytics(context) {
  const teacher = requireUser(context.req, context.db, 'teacher');
  ok(context, getTeacherLessonAnalytics(context.db, teacher, context.params.id));
}

export async function createAnnouncement(context) {
  const teacher = requireUser(context.req, context.db, 'teacher');
  created(context, createTeacherAnnouncement(context.db, teacher, await bodyOf(context.req)));
}
