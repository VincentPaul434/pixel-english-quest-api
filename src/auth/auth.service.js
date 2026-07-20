import { createSession } from './auth.session.js';
import { AppError } from '../shared/utils/appError.js';
import {
  createUser,
  deleteSessionByToken,
  findUserByEmail,
  passwordMatches,
  toPublicUser
} from './auth.repository.js';
import { validateLogin, validateRegistration } from './auth.validator.js';

export function register(db, body) {
  const input = validateRegistration(body);
  if (findUserByEmail(db, input.email)) throw new AppError(409, 'An account already uses that email.');
  const user = createUser(db, input);
  return { ...createSession(db, user.id), user: toPublicUser(user) };
}

export function login(db, body) {
  const input = validateLogin(body);
  const user = findUserByEmail(db, input.email);
  if (!user || !passwordMatches(input.password, user.password_hash)) throw new AppError(401, 'Email or password is incorrect.');
  return { ...createSession(db, user.id), user: toPublicUser(user) };
}

export function logout(db, authorization) {
  const token = String(authorization).slice(7).trim();
  deleteSessionByToken(db, token);
  return { ok: true };
}

export function publicProfile(user) {
  return toPublicUser(user);
}
