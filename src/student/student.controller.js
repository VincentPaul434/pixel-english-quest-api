import { requireUser } from '../shared/middleware/auth.middleware.js';
import { bodyOf, created, ok } from '../shared/http.js';
import {
  addVocabulary,
  getQuickQuizQuestion,
  getStudentDashboard,
  getTeacherDashboard,
  removeVocabulary,
  resetProgress,
  saveProfile,
  submitQuickQuiz
} from './student.service.js';

export async function dashboard(context) {
  ok(context, await getStudentDashboard(context.db, await requireUser(context.req, context.db, 'student')));
}

export async function teacherDashboard(context) {
  ok(context, await getTeacherDashboard(context.db, await requireUser(context.req, context.db, 'teacher')));
}

export async function profile(context) {
  const user = await requireUser(context.req, context.db);
  ok(context, await saveProfile(context.db, user, await bodyOf(context.req)));
}

export async function reset(context) {
  ok(context, await resetProgress(context.db, await requireUser(context.req, context.db, 'student')));
}

export async function quickQuiz(context) {
  await requireUser(context.req, context.db, 'student');
  ok(context, getQuickQuizQuestion());
}

export async function quickQuizSubmit(context) {
  const user = await requireUser(context.req, context.db, 'student');
  ok(context, await submitQuickQuiz(context.db, user, await bodyOf(context.req)));
}

export async function vocabularyCreate(context) {
  const user = await requireUser(context.req, context.db, 'student');
  created(context, await addVocabulary(context.db, user, await bodyOf(context.req)));
}

export async function vocabularyDelete(context) {
  ok(context, await removeVocabulary(context.db, await requireUser(context.req, context.db, 'student'), context.params.id));
}
