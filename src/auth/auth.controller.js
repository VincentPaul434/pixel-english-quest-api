import { requireUser } from '../shared/middleware/auth.middleware.js';
import { bodyOf, created, ok } from '../shared/http.js';
import { login, logout, publicProfile, register } from './auth.service.js';

export async function registerUser(context) {
  created(context, register(context.db, await bodyOf(context.req)));
}

export async function loginUser(context) {
  ok(context, login(context.db, await bodyOf(context.req)));
}

export async function logoutUser(context) {
  requireUser(context.req, context.db);
  ok(context, logout(context.db, context.req.headers.authorization));
}

export async function getCurrentUser(context) {
  ok(context, publicProfile(requireUser(context.req, context.db)));
}
