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
  const teacher = await requireUser(context.req, context.db, 'teacher');
  created(context, await createTeacherCourse(context.db, teacher, await bodyOf(context.req)));
}

export async function updateCourse(context) {
  const teacher = await requireUser(context.req, context.db, 'teacher');
  ok(context, await updateTeacherCourse(context.db, teacher, context.params.id, await bodyOf(context.req)));
}

export async function createModule(context) {
  const teacher = await requireUser(context.req, context.db, 'teacher');
  created(context, await createTeacherModule(context.db, teacher, context.params.courseId, await bodyOf(context.req)));
}

export async function createLesson(context) {
  const teacher = await requireUser(context.req, context.db, 'teacher');
  created(context, await createTeacherLesson(context.db, teacher, await bodyOf(context.req)));
}

export async function updateLesson(context) {
  const teacher = await requireUser(context.req, context.db, 'teacher');
  ok(context, await updateTeacherLesson(context.db, teacher, context.params.id, await bodyOf(context.req)));
}

export async function archiveLesson(context) {
  const teacher = await requireUser(context.req, context.db, 'teacher');
  ok(context, await archiveTeacherLesson(context.db, teacher, context.params.id));
}

export async function publishLesson(context) {
  const teacher = await requireUser(context.req, context.db, 'teacher');
  ok(context, await publishTeacherLesson(context.db, teacher, context.params.id));
}

export async function assignLesson(context) {
  const teacher = await requireUser(context.req, context.db, 'teacher');
  created(context, await assignTeacherLesson(context.db, teacher, context.params.id, await bodyOf(context.req)));
}

export async function getLessonAnalytics(context) {
  const teacher = await requireUser(context.req, context.db, 'teacher');
  ok(context, await getTeacherLessonAnalytics(context.db, teacher, context.params.id));
}

export async function createAnnouncement(context) {
  const teacher = await requireUser(context.req, context.db, 'teacher');
  created(context, await createTeacherAnnouncement(context.db, teacher, await bodyOf(context.req)));
}
