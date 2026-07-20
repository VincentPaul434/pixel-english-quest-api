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
  ok(context, getStudentDashboard(context.db, requireUser(context.req, context.db, 'student')));
}

export async function teacherDashboard(context) {
  ok(context, getTeacherDashboard(context.db, requireUser(context.req, context.db, 'teacher')));
}

export async function profile(context) {
  const user = requireUser(context.req, context.db);
  ok(context, saveProfile(context.db, user, await bodyOf(context.req)));
}

export async function reset(context) {
  ok(context, resetProgress(context.db, requireUser(context.req, context.db, 'student')));
}

export async function quickQuiz(context) {
  requireUser(context.req, context.db, 'student');
  ok(context, getQuickQuizQuestion());
}

export async function quickQuizSubmit(context) {
  const user = requireUser(context.req, context.db, 'student');
  ok(context, submitQuickQuiz(context.db, user, await bodyOf(context.req)));
}

export async function vocabularyCreate(context) {
  const user = requireUser(context.req, context.db, 'student');
  created(context, addVocabulary(context.db, user, await bodyOf(context.req)));
}

export async function vocabularyDelete(context) {
  ok(context, removeVocabulary(context.db, requireUser(context.req, context.db, 'student'), context.params.id));
}
