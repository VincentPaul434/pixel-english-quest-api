import { teacherInviteCode } from '../config/app-config.js';
import { cleanText } from '../shared/data-utils.js';
import { AppError } from '../shared/utils/appError.js';

export function validateRegistration(body) {
  const name = cleanText(body.name, 40);
  const email = cleanText(body.email, 160).toLocaleLowerCase();
  const password = String(body.password || '');
  const role = body.role === 'teacher' ? 'teacher' : 'student';

  if (name.length < 2) throw new AppError(400, 'Name must contain at least 2 characters.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError(400, 'Enter a valid email address.');
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new AppError(400, 'Password needs at least 8 characters, including a letter and number.');
  }
  if (role === 'teacher' && teacherInviteCode && body.teacherInviteCode !== teacherInviteCode) {
    throw new AppError(403, 'A valid teacher invitation code is required.');
  }

  return { name, email, password, role };
}

export function validateLogin(body) {
  return {
    email: cleanText(body.email, 160).toLocaleLowerCase(),
    password: String(body.password || '')
  };
}
