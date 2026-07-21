import { requireUser } from '../shared/middleware/auth.middleware.js';
import { bodyOf, created, ok } from '../shared/http.js';
import {
  confirmEmailVerification, confirmPasswordReset, disableMfa, enableMfa, login, logout,
  publicProfile, register, requestEmailVerification, requestPasswordReset, setupMfa
} from './auth.service.js';

export async function registerUser(context) {
  created(context, await register(context.db, await bodyOf(context.req)));
}

export async function loginUser(context) {
  ok(context, await login(context.db, await bodyOf(context.req)));
}

export async function logoutUser(context) {
  await requireUser(context.req, context.db);
  ok(context, await logout(context.db, context.req.headers.authorization));
}

export async function getCurrentUser(context) {
  ok(context, publicProfile(await requireUser(context.req, context.db)));
}

export async function passwordResetRequest(context) { ok(context, await requestPasswordReset(context.db, await bodyOf(context.req))); }
export async function passwordResetConfirm(context) { ok(context, await confirmPasswordReset(context.db, await bodyOf(context.req))); }
export async function emailVerificationRequest(context) { ok(context, await requestEmailVerification(context.db, await requireUser(context.req, context.db))); }
export async function emailVerificationConfirm(context) { ok(context, await confirmEmailVerification(context.db, await bodyOf(context.req))); }
export async function mfaSetup(context) { ok(context, await setupMfa(context.db, await requireUser(context.req, context.db))); }
export async function mfaEnable(context) { ok(context, await enableMfa(context.db, await requireUser(context.req, context.db), await bodyOf(context.req))); }
export async function mfaDisable(context) { ok(context, await disableMfa(context.db, await requireUser(context.req, context.db), await bodyOf(context.req))); }
