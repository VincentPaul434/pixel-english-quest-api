import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createSession } from './auth.session.js';
import { AppError } from '../shared/utils/appError.js';
import { cleanText } from '../shared/data-utils.js';
import { tokenHash } from '../config/database.js';
import {
  createUser,
  deleteSessionByToken,
  findUserByEmail,
  passwordMatches,
  toPublicUser,
  updatePassword
} from './auth.repository.js';
import { validateLogin, validatePassword, validateRegistration } from './auth.validator.js';

const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let output = '';
  for (let index = 0; index < bits.length; index += 5) output += base32Alphabet[Number.parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)];
  return output;
}

function base32Decode(value) {
  let bits = '';
  for (const character of String(value).replace(/=+$/g, '').toUpperCase()) {
    const index = base32Alphabet.indexOf(character);
    if (index >= 0) bits += index.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret, time = Date.now()) {
  const counter = BigInt(Math.floor(time / 30000));
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(counter);
  const digest = createHmac('sha1', base32Decode(secret)).update(bytes).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((((digest[offset] & 127) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3]) % 1000000).padStart(6, '0');
}

function verifyTotp(secret, code) {
  const supplied = Buffer.from(String(code || '').padStart(6, '0'));
  return [-30000, 0, 30000].some((offset) => {
    const expected = Buffer.from(totp(secret, Date.now() + offset));
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  });
}

async function sendAccountMessage(kind, user, token) {
  const webhook = process.env.EMAIL_WEBHOOK_URL;
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, email: user.email, name: user.name, token })
    });
  } catch {
    // Account endpoints stay privacy-safe even when an optional email provider is unavailable.
  }
}

async function createOneTimeToken(db, table, user, lifetimeMinutes, kind) {
  const token = randomBytes(32).toString('base64url');
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + lifetimeMinutes * 60000).toISOString();
  await db.prepare(`DELETE FROM ${table} WHERE user_id = ? OR expires_at <= ?`).run(user.id, createdAt.toISOString());
  await db.prepare(`INSERT INTO ${table} (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`)
    .run(tokenHash(token), user.id, expiresAt, createdAt.toISOString());
  await sendAccountMessage(kind, user, token);
  return process.env.NODE_ENV === 'production' ? {} : { developmentToken: token };
}

export async function register(db, body) {
  const input = validateRegistration(body);
  if (await findUserByEmail(db, input.email)) throw new AppError(409, 'An account already uses that email.');
  const user = await createUser(db, input);
  const verification = await createOneTimeToken(db, 'email_verification_tokens', user, 24 * 60, 'verify-email');
  return { ...await createSession(db, user.id), user: toPublicUser(user), ...verification };
}

export async function login(db, body) {
  const input = validateLogin(body);
  const user = await findUserByEmail(db, input.email);
  if (!user || !passwordMatches(input.password, user.password_hash)) throw new AppError(401, 'Email or password is incorrect.');
  if (user.mfa_enabled && !verifyTotp(user.mfa_secret, input.mfaCode)) throw new AppError(401, 'A valid authenticator code is required.');
  return { ...await createSession(db, user.id), user: toPublicUser(user) };
}

export async function logout(db, authorization) {
  const token = String(authorization).slice(7).trim();
  await deleteSessionByToken(db, token);
  return { ok: true };
}

export function publicProfile(user) {
  return toPublicUser(user);
}

export async function requestPasswordReset(db, body) {
  const email = cleanText(body.email, 160).toLocaleLowerCase();
  const user = await findUserByEmail(db, email);
  const development = user ? await createOneTimeToken(db, 'password_reset_tokens', user, 30, 'password-reset') : {};
  return { ok: true, message: 'If that account exists, password reset instructions have been sent.', ...development };
}

export async function confirmPasswordReset(db, body) {
  const token = cleanText(body.token, 200);
  const password = validatePassword(body.password);
  const row = await db.prepare(`SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`)
    .get(tokenHash(token), new Date().toISOString());
  if (!row) throw new AppError(400, 'This password reset link is invalid or expired.');
  await updatePassword(db, row.user_id, password);
  await db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE token_hash = ?').run(new Date().toISOString(), row.token_hash);
  return { ok: true };
}

export async function requestEmailVerification(db, user) {
  if (user.email_verified_at) return { ok: true, alreadyVerified: true };
  return { ok: true, ...await createOneTimeToken(db, 'email_verification_tokens', user, 24 * 60, 'verify-email') };
}

export async function confirmEmailVerification(db, body) {
  const token = cleanText(body.token, 200);
  const row = await db.prepare(`SELECT * FROM email_verification_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`)
    .get(tokenHash(token), new Date().toISOString());
  if (!row) throw new AppError(400, 'This verification link is invalid or expired.');
  const timestamp = new Date().toISOString();
  await db.prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?').run(timestamp, row.user_id);
  await db.prepare('UPDATE email_verification_tokens SET used_at = ? WHERE token_hash = ?').run(timestamp, row.token_hash);
  return { ok: true };
}

export async function setupMfa(db, user) {
  const secret = base32Encode(randomBytes(20));
  await db.prepare('UPDATE users SET mfa_secret = ?, mfa_enabled = 0 WHERE id = ?').run(secret, user.id);
  const issuer = encodeURIComponent('Pixel English Quest');
  const account = encodeURIComponent(user.email);
  return { secret, otpauthUrl: `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&digits=6&period=30` };
}

export async function enableMfa(db, user, body) {
  const current = await db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  if (!current.mfa_secret || !verifyTotp(current.mfa_secret, cleanText(body.code, 12))) throw new AppError(400, 'Authenticator code is invalid.');
  await db.prepare('UPDATE users SET mfa_enabled = 1 WHERE id = ?').run(user.id);
  return { ok: true, mfaEnabled: true };
}

export async function disableMfa(db, user, body) {
  const current = await db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  if (!passwordMatches(String(body.password || ''), current.password_hash)) throw new AppError(401, 'Password is incorrect.');
  await db.prepare('UPDATE users SET mfa_secret = NULL, mfa_enabled = 0 WHERE id = ?').run(user.id);
  return { ok: true, mfaEnabled: false };
}
