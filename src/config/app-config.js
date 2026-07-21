export const port = Number(process.env.PORT) || 3001;
export const maxBodyBytes = 1024 * 1024;
export const sessionDays = 30;
export const teacherInviteCode = process.env.TEACHER_INVITE_CODE || '';
export const rateLimit = { requests: 180, windowMs: 60000 };

export const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
);

export const allowedOriginHosts = new Set(
  (process.env.ALLOWED_ORIGIN_HOSTS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
);
