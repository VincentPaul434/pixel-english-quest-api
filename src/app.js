import 'dotenv/config';
import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { quickQuestions } from './modules/lesson/index.js';
import {
  addActivity,
  createDatabase,
  hashPassword,
  inTransaction,
  publicUser,
  tokenHash,
  uniqueId,
  verifyPassword
} from './modules/user/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDatabaseFile = process.env.ACADEMY_DB_FILE || path.join(__dirname, '..', 'academy.db');
export const port = Number(process.env.PORT) || 3001;
const maxBodyBytes = 1024 * 1024;
const sessionDays = 30;
const teacherInviteCode = process.env.TEACHER_INVITE_CODE || '';
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174')
    .split(',').map((item) => item.trim()).filter(Boolean)
);
const allowedOriginHosts = new Set(
  (process.env.ALLOWED_ORIGIN_HOSTS || '')
    .split(',').map((item) => item.trim().toLowerCase()).filter(Boolean)
);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function parseJson(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function cleanText(value, max = 5000) {
  return String(value ?? '').trim().slice(0, max);
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function optionalIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, 'Enter a valid date and time.');
  return date.toISOString();
}

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (allowedOrigins.has(origin)) return true;
  try {
    return allowedOriginHosts.has(new URL(origin).hostname.toLowerCase());
  } catch {
    return false;
  }
}

function responseHeaders(req, requestId) {
  const origin = req.headers.origin;
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'X-Request-Id': requestId
  };
  if (isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }
  return headers;
}

function json(req, res, requestId, status, body) {
  res.writeHead(status, responseHeaders(req, requestId));
  res.end(JSON.stringify(body));
}

async function bodyOf(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBodyBytes) throw new HttpError(413, 'Request body is too large.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Invalid JSON body.');
  }
}

function currentUser(req, db) {
  const authorization = String(req.headers.authorization || '');
  if (!authorization.startsWith('Bearer ')) return null;
  const token = authorization.slice(7).trim();
  if (!token) return null;
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
  const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?`).get(tokenHash(token), new Date().toISOString());
  return row || null;
}

function requireUser(req, db, role) {
  const user = currentUser(req, db);
  if (!user) throw new HttpError(401, 'Please sign in to continue.');
  if (role && user.role !== role) throw new HttpError(403, `${role === 'teacher' ? 'Teacher' : 'Student'} access is required.`);
  return user;
}

function createSession(db, userId) {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + sessionDays * 86400000).toISOString();
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(tokenHash(token), userId, expiresAt, now.toISOString());
  return { token, expiresAt };
}

function lessonQuestions(db, lessonId, includeAnswers = false) {
  return db.prepare('SELECT * FROM questions WHERE lesson_id = ? ORDER BY position, id').all(lessonId).map((row) => {
    const question = {
      id: row.id,
      prompt: row.prompt,
      type: row.type,
      choices: parseJson(row.choices_json, []),
      explanation: includeAnswers ? row.explanation : undefined
    };
    if (includeAnswers) question.answer = parseJson(row.answer_json);
    return question;
  });
}

function lessonFromRow(db, row, includeAnswers = false) {
  return {
    id: row.id,
    courseId: row.course_id,
    courseTitle: row.course_title,
    moduleId: row.module_id,
    moduleTitle: row.module_title,
    category: row.category,
    title: row.title,
    eyebrow: row.eyebrow,
    icon: row.icon,
    minutes: row.minutes,
    difficulty: row.difficulty,
    passage: row.passage,
    audioText: row.audio_text,
    speakPhrase: row.speak_phrase,
    audioUrl: row.audio_url,
    videoUrl: row.video_url,
    resourceUrl: row.resource_url,
    objectives: parseJson(row.objectives_json, []),
    xpReward: row.xp_reward,
    masteryScore: row.mastery_score,
    position: row.position,
    status: row.status,
    completed: row.progress_status === 'completed',
    progress: row.progress_status ? {
      status: row.progress_status,
      bestScore: row.best_score,
      lastScore: row.last_score,
      attempts: row.attempts,
      lastQuestion: row.last_question,
      draftAnswers: parseJson(row.draft_answers_json, []),
      bookmarked: Boolean(row.bookmarked),
      notes: row.notes || ''
    } : null,
    questions: lessonQuestions(db, row.id, includeAnswers)
  };
}

function publishedLessonRow(db, lessonId, userId) {
  return db.prepare(`SELECT l.*, c.title AS course_title, m.title AS module_title,
      p.status AS progress_status, p.best_score, p.last_score, p.attempts, p.last_question,
      p.draft_answers_json, p.bookmarked, p.notes
    FROM lessons l
    JOIN courses c ON c.id = l.course_id
    JOIN enrollments e ON e.course_id = c.id AND e.user_id = ?
    LEFT JOIN modules m ON m.id = l.module_id
    LEFT JOIN progress p ON p.lesson_id = l.id AND p.user_id = ?
    WHERE l.id = ? AND l.status = 'published' AND c.status = 'published'`).get(userId, userId, lessonId);
}

function achievementsFor(db, userId, completed, total) {
  const reading = db.prepare(`SELECT COUNT(*) AS count FROM progress p JOIN lessons l ON l.id = p.lesson_id
    WHERE p.user_id = ? AND p.status = 'completed' AND l.category = 'reading'`).get(userId).count;
  const quickWins = db.prepare('SELECT COUNT(*) AS count FROM quick_attempts WHERE user_id = ? AND correct = 1').get(userId).count;
  const streak = learningStreak(db, userId);
  return [
    { id: 'first-step', icon: 'star', title: 'First Step', description: 'Complete your first lesson', unlocked: completed >= 1 },
    { id: 'page-turner', icon: 'book', title: 'Page Turner', description: 'Complete two reading quests', unlocked: reading >= 2 },
    { id: 'quiz-whiz', icon: 'zap', title: 'Quiz Whiz', description: 'Answer 3 quick quizzes correctly', unlocked: quickWins >= 3 },
    { id: 'streak-keeper', icon: 'flame', title: 'Streak Keeper', description: 'Learn on 3 consecutive days', unlocked: streak >= 3 },
    { id: 'academy-hero', icon: 'trophy', title: 'English Pixel Hero', description: 'Complete every enrolled lesson', unlocked: total > 0 && completed >= total }
  ];
}

function learningStreak(db, userId) {
  const rows = db.prepare(`SELECT created_at FROM lesson_attempts WHERE user_id = ?
    UNION ALL SELECT created_at FROM quick_attempts WHERE user_id = ? ORDER BY created_at DESC`).all(userId, userId);
  const days = [...new Set(rows.map((row) => row.created_at.slice(0, 10)))].sort().reverse();
  if (!days.length) return 0;
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const yesterdayKey = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
  if (days[0] !== todayKey && days[0] !== yesterdayKey) return 0;
  let streak = 1;
  let cursor = new Date(`${days[0]}T00:00:00.000Z`);
  for (let index = 1; index < days.length; index += 1) {
    cursor = new Date(cursor.getTime() - 86400000);
    if (days[index] !== cursor.toISOString().slice(0, 10)) break;
    streak += 1;
  }
  return streak;
}

function studentDashboard(db, user) {
  const rows = db.prepare(`SELECT l.*, c.title AS course_title, m.title AS module_title,
      p.status AS progress_status, p.best_score, p.last_score, p.attempts, p.last_question,
      p.draft_answers_json, p.bookmarked, p.notes
    FROM lessons l
    JOIN courses c ON c.id = l.course_id
    JOIN enrollments e ON e.course_id = c.id AND e.user_id = ?
    LEFT JOIN modules m ON m.id = l.module_id
    LEFT JOIN progress p ON p.lesson_id = l.id AND p.user_id = ?
    WHERE l.status = 'published' AND c.status = 'published'
    ORDER BY c.created_at, m.position, l.position, l.created_at`).all(user.id, user.id);
  const lessons = rows.map((row) => {
    const lesson = lessonFromRow(db, row);
    delete lesson.passage;
    delete lesson.audioText;
    delete lesson.speakPhrase;
    delete lesson.questions;
    return lesson;
  });
  const completed = lessons.filter((lesson) => lesson.completed).length;
  const total = lessons.length;
  const focusSeconds = db.prepare('SELECT COALESCE(SUM(duration_seconds), 0) AS seconds FROM lesson_attempts WHERE user_id = ?').get(user.id).seconds;
  const achievements = achievementsFor(db, user.id, completed, total);
  const activities = db.prepare(`SELECT id, type, icon, title, detail, created_at AS timestamp
    FROM activities WHERE user_id = ? ORDER BY created_at DESC LIMIT 12`).all(user.id);
  const assignments = db.prepare(`SELECT a.id, a.title, a.due_at AS dueAt, a.lesson_id AS lessonId,
      l.title AS lessonTitle, c.title AS courseTitle, ast.status
    FROM assignment_students ast
    JOIN assignments a ON a.id = ast.assignment_id
    JOIN lessons l ON l.id = a.lesson_id
    JOIN courses c ON c.id = a.course_id
    WHERE ast.student_id = ? ORDER BY ast.status, a.due_at`).all(user.id);
  const announcements = db.prepare(`SELECT DISTINCT a.id, a.title, a.body, a.published_at AS publishedAt,
      c.title AS courseTitle, u.name AS teacherName
    FROM announcements a JOIN courses c ON c.id = a.course_id
    JOIN enrollments e ON e.course_id = c.id AND e.user_id = ?
    JOIN users u ON u.id = a.teacher_id
    ORDER BY a.published_at DESC LIMIT 8`).all(user.id);
  const vocabulary = db.prepare('SELECT id, term, definition, created_at AS createdAt FROM vocabulary WHERE user_id = ? ORDER BY created_at DESC').all(user.id);
  const quickQuizWins = db.prepare('SELECT COUNT(*) AS count FROM quick_attempts WHERE user_id = ? AND correct = 1').get(user.id).count;
  const recommendation = lessons.find((lesson) => lesson.progress?.status === 'in_progress')
    || lessons.find((lesson) => !lesson.completed) || null;
  const skillMastery = ['reading', 'grammar', 'listening', 'speaking'].map((category) => {
    const categoryLessons = lessons.filter((lesson) => lesson.category === category);
    const score = categoryLessons.length
      ? Math.round(categoryLessons.reduce((sum, lesson) => sum + (lesson.progress?.bestScore || 0), 0) / categoryLessons.length)
      : 0;
    return { category, score };
  });
  return {
    profile: publicUser(user),
    stats: {
      completed,
      total,
      progress: total ? Math.round((completed / total) * 100) : 0,
      learningMinutes: Math.round(focusSeconds / 60),
      achievements: achievements.filter((item) => item.unlocked).length,
      quickQuizWins,
      streak: learningStreak(db, user.id)
    },
    lessons,
    achievements,
    activities,
    assignments,
    announcements,
    vocabulary,
    recommendation,
    skillMastery
  };
}

function teacherDashboard(db, teacher) {
  const courses = db.prepare(`SELECT c.*,
      (SELECT COUNT(*) FROM modules m WHERE m.course_id = c.id) AS moduleCount,
      (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id AND l.status != 'archived') AS lessonCount,
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS studentCount
    FROM courses c WHERE c.teacher_id = ? AND c.status != 'archived' ORDER BY c.updated_at DESC`).all(teacher.id).map((course) => ({
      id: course.id,
      title: course.title,
      description: course.description,
      difficulty: course.difficulty,
      status: course.status,
      moduleCount: course.moduleCount,
      lessonCount: course.lessonCount,
      studentCount: course.studentCount,
      modules: db.prepare('SELECT id, title, position FROM modules WHERE course_id = ? ORDER BY position').all(course.id),
      lessons: db.prepare(`SELECT l.id, l.title, l.category, l.difficulty, l.minutes, l.status, l.module_id AS moduleId,
        l.mastery_score AS masteryScore, COUNT(q.id) AS questionCount
        FROM lessons l LEFT JOIN questions q ON q.lesson_id = l.id
        WHERE l.course_id = ? AND l.status != 'archived'
        GROUP BY l.id ORDER BY l.position, l.created_at`).all(course.id)
    }));
  const students = db.prepare(`SELECT u.id, u.name, u.email, u.proficiency, u.xp,
      COUNT(DISTINCT e.course_id) AS courseCount,
      COUNT(DISTINCT CASE WHEN p.status = 'completed' THEN p.lesson_id END) AS completedLessons,
      COALESCE(ROUND(AVG(CASE WHEN p.attempts > 0 THEN p.best_score END)), 0) AS averageScore
    FROM users u JOIN enrollments e ON e.user_id = u.id
    JOIN courses c ON c.id = e.course_id AND c.teacher_id = ?
    LEFT JOIN progress p ON p.user_id = u.id
    GROUP BY u.id ORDER BY u.name`).all(teacher.id);
  const assignments = db.prepare(`SELECT a.id, a.title, a.due_at AS dueAt, l.title AS lessonTitle, c.title AS courseTitle,
      COUNT(ast.student_id) AS studentCount,
      SUM(CASE WHEN ast.status = 'completed' THEN 1 ELSE 0 END) AS completedCount
    FROM assignments a JOIN lessons l ON l.id = a.lesson_id JOIN courses c ON c.id = a.course_id
    LEFT JOIN assignment_students ast ON ast.assignment_id = a.id
    WHERE a.teacher_id = ? GROUP BY a.id ORDER BY a.created_at DESC`).all(teacher.id);
  const announcements = db.prepare(`SELECT a.id, a.title, a.body, a.published_at AS publishedAt, c.title AS courseTitle
    FROM announcements a JOIN courses c ON c.id = a.course_id WHERE a.teacher_id = ? ORDER BY a.published_at DESC`).all(teacher.id);
  const totalAttempts = db.prepare(`SELECT COUNT(*) AS count FROM lesson_attempts la JOIN lessons l ON l.id = la.lesson_id
    JOIN courses c ON c.id = l.course_id WHERE c.teacher_id = ?`).get(teacher.id).count;
  return {
    profile: publicUser(teacher), courses, students, assignments, announcements,
    stats: {
      courses: courses.length,
      publishedLessons: courses.reduce((sum, course) => sum + course.lessons.filter((lesson) => lesson.status === 'published').length, 0),
      students: students.length,
      attempts: totalAttempts
    }
  };
}

function ownedCourse(db, courseId, teacherId) {
  const course = db.prepare('SELECT * FROM courses WHERE id = ? AND teacher_id = ?').get(courseId, teacherId);
  if (!course) throw new HttpError(404, 'Course not found.');
  return course;
}

function ownedLesson(db, lessonId, teacherId) {
  const lesson = db.prepare(`SELECT l.*, c.teacher_id, c.title AS course_title, m.title AS module_title
    FROM lessons l JOIN courses c ON c.id = l.course_id LEFT JOIN modules m ON m.id = l.module_id
    WHERE l.id = ? AND c.teacher_id = ?`).get(lessonId, teacherId);
  if (!lesson) throw new HttpError(404, 'Lesson not found.');
  return lesson;
}

function normalizeQuestions(rawQuestions, publishing = false) {
  if (!Array.isArray(rawQuestions)) return [];
  const questions = rawQuestions.slice(0, 50).map((raw, index) => {
    const prompt = cleanText(raw.prompt, 500);
    const type = ['multiple_choice', 'true_false', 'fill_blank'].includes(raw.type) ? raw.type : 'multiple_choice';
    let choices = type === 'true_false' ? ['True', 'False'] : Array.isArray(raw.choices) ? raw.choices.map((item) => cleanText(item, 200)).filter(Boolean).slice(0, 8) : [];
    let answer = type === 'fill_blank' ? cleanText(raw.answer, 200) : Number(raw.answer);
    if (!prompt) throw new HttpError(400, `Question ${index + 1} needs a prompt.`);
    if (type !== 'fill_blank' && (choices.length < 2 || !Number.isInteger(answer) || answer < 0 || answer >= choices.length)) {
      throw new HttpError(400, `Question ${index + 1} needs valid choices and a correct answer.`);
    }
    if (type === 'fill_blank' && !answer) throw new HttpError(400, `Question ${index + 1} needs a correct answer.`);
    return { prompt, type, choices, answer, explanation: cleanText(raw.explanation, 1000) };
  });
  if (publishing && questions.length === 0) throw new HttpError(400, 'A published lesson needs at least one question.');
  return questions;
}

function normalizeLesson(body, publishing = false) {
  const lesson = {
    courseId: cleanText(body.courseId, 100),
    moduleId: cleanText(body.moduleId, 100) || null,
    title: cleanText(body.title, 120),
    category: ['reading', 'grammar', 'listening', 'speaking'].includes(body.category) ? body.category : 'reading',
    eyebrow: cleanText(body.eyebrow, 80) || 'English Quest',
    icon: cleanText(body.icon, 40) || body.category || 'book',
    minutes: clampInteger(body.minutes, 1, 240, 5),
    difficulty: cleanText(body.difficulty, 40) || 'Beginner',
    passage: cleanText(body.passage, 20000),
    audioText: cleanText(body.audioText, 10000) || null,
    speakPhrase: cleanText(body.speakPhrase, 2000) || null,
    audioUrl: cleanText(body.audioUrl, 2000) || null,
    videoUrl: cleanText(body.videoUrl, 2000) || null,
    resourceUrl: cleanText(body.resourceUrl, 2000) || null,
    objectives: Array.isArray(body.objectives) ? body.objectives.map((item) => cleanText(item, 300)).filter(Boolean).slice(0, 10) : [],
    xpReward: clampInteger(body.xpReward, 0, 5000, 100),
    masteryScore: clampInteger(body.masteryScore, 1, 100, 75),
    position: clampInteger(body.position, 0, 10000, 0),
    status: publishing || body.status === 'published' ? 'published' : 'draft',
    questions: normalizeQuestions(body.questions, publishing || body.status === 'published')
  };
  if (!lesson.courseId || !lesson.title || !lesson.passage) throw new HttpError(400, 'Course, title, and lesson content are required.');
  if (lesson.category === 'listening' && publishing && !lesson.audioText) throw new HttpError(400, 'A listening lesson needs an audio script.');
  if (lesson.category === 'speaking' && publishing && !lesson.speakPhrase) throw new HttpError(400, 'A speaking lesson needs a practice phrase.');
  return lesson;
}

function saveQuestions(db, lessonId, questions) {
  db.prepare('DELETE FROM questions WHERE lesson_id = ?').run(lessonId);
  const statement = db.prepare(`INSERT INTO questions
    (id, lesson_id, prompt, type, choices_json, answer_json, explanation, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  questions.forEach((question, index) => statement.run(
    uniqueId('question'), lessonId, question.prompt, question.type, JSON.stringify(question.choices),
    JSON.stringify(question.answer), question.explanation, index
  ));
}

function submitLessonAttempt(db, user, lesson, body) {
  const questions = lessonQuestions(db, lesson.id, true);
  const answers = Array.isArray(body.answers) ? body.answers : [];
  if (!questions.length || answers.length !== questions.length) throw new HttpError(400, 'Answer every question before submitting.');
  let correct = 0;
  const review = questions.map((question, index) => {
    const selected = answers[index];
    const valid = question.type === 'fill_blank'
      ? typeof selected === 'string' && selected.trim().length > 0
      : Number.isInteger(selected) && selected >= 0 && selected < question.choices.length;
    if (!valid) throw new HttpError(400, `Question ${index + 1} has an invalid answer.`);
    const isCorrect = question.type === 'fill_blank'
      ? selected.trim().toLocaleLowerCase() === String(question.answer).trim().toLocaleLowerCase()
      : selected === question.answer;
    if (isCorrect) correct += 1;
    return {
      prompt: question.prompt,
      type: question.type,
      selected,
      answer: question.answer,
      correct: isCorrect,
      explanation: question.explanation
    };
  });
  const score = Math.round((correct / questions.length) * 100);
  const passed = score >= lesson.mastery_score;
  const previous = db.prepare('SELECT * FROM progress WHERE user_id = ? AND lesson_id = ?').get(user.id, lesson.id);
  const firstCompletion = passed && previous?.status !== 'completed';
  const now = new Date().toISOString();
  const durationSeconds = clampInteger(body.durationSeconds, 0, 86400, 0);

  inTransaction(db, () => {
    db.prepare(`INSERT INTO lesson_attempts
      (id, user_id, lesson_id, answers_json, score, correct_count, total_count, passed, duration_seconds, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(uniqueId('attempt'), user.id, lesson.id, JSON.stringify(answers), score, correct, questions.length, passed ? 1 : 0, durationSeconds, now);
    db.prepare(`INSERT INTO progress
      (user_id, lesson_id, status, best_score, last_score, attempts, last_question, draft_answers_json, bookmarked, notes, completed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, 0, '[]', 0, '', ?, ?)
      ON CONFLICT(user_id, lesson_id) DO UPDATE SET
        status = CASE WHEN progress.status = 'completed' OR excluded.status = 'completed' THEN 'completed' ELSE excluded.status END,
        best_score = MAX(progress.best_score, excluded.best_score), last_score = excluded.last_score,
        attempts = progress.attempts + 1, last_question = 0, draft_answers_json = '[]',
        completed_at = COALESCE(progress.completed_at, excluded.completed_at), updated_at = excluded.updated_at`)
      .run(user.id, lesson.id, passed ? 'completed' : 'in_progress', score, score, passed ? now : null, now);
    if (firstCompletion) db.prepare('UPDATE users SET xp = xp + ? WHERE id = ?').run(lesson.xp_reward, user.id);
    if (passed) {
      db.prepare(`UPDATE assignment_students SET status = 'completed', completed_at = ?
        WHERE student_id = ? AND assignment_id IN (SELECT id FROM assignments WHERE lesson_id = ?)`)
        .run(now, user.id, lesson.id);
    }
    addActivity(db, user.id, {
      type: 'lesson', icon: lesson.icon,
      title: firstCompletion ? `Mastered ${lesson.title}` : passed ? `Practised ${lesson.title}` : `Attempted ${lesson.title}`,
      detail: `${score}% score · ${correct}/${questions.length} correct${firstCompletion ? ` · +${lesson.xp_reward} XP` : passed ? '' : ' · Retry needed'}`
    });
  });
  const freshUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  return { score, correct, total: questions.length, passed, masteryScore: lesson.mastery_score, firstCompletion, review, dashboard: studentDashboard(db, freshUser) };
}

function wordAccuracy(expected, transcript) {
  const words = (value) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}\s']/gu, '').split(/\s+/).filter(Boolean);
  const target = words(expected);
  const heard = words(transcript);
  if (!target.length) return 0;
  const matches = target.reduce((count, word, index) => count + (heard[index] === word ? 1 : 0), 0);
  return Math.round((matches / target.length) * 100);
}

async function api(req, res, pathname, db, requestId) {
  if (req.method === 'OPTIONS') return json(req, res, requestId, 204, {});

  if (req.method === 'GET' && pathname === '/api/health') {
    const database = db.prepare('SELECT 1 AS ok').get().ok === 1;
    return json(req, res, requestId, 200, { status: 'ok', service: 'pixel-english-quest-api', database });
  }

  if (req.method === 'POST' && pathname === '/api/auth/register') {
    const body = await bodyOf(req);
    const name = cleanText(body.name, 40);
    const email = cleanText(body.email, 160).toLocaleLowerCase();
    const password = String(body.password || '');
    const role = body.role === 'teacher' ? 'teacher' : 'student';
    if (name.length < 2) throw new HttpError(400, 'Name must contain at least 2 characters.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new HttpError(400, 'Password needs at least 8 characters, including a letter and number.');
    if (role === 'teacher' && teacherInviteCode && body.teacherInviteCode !== teacherInviteCode) throw new HttpError(403, 'A valid teacher invitation code is required.');
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'An account already uses that email.');
    const id = uniqueId('user');
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, email, hashPassword(password), name, role, now);
    if (role === 'student') {
      const enroll = db.prepare('INSERT OR IGNORE INTO enrollments (user_id, course_id, enrolled_at) VALUES (?, ?, ?)');
      db.prepare("SELECT id FROM courses WHERE status = 'published'").all().forEach((course) => enroll.run(id, course.id, now));
    }
    const session = createSession(db, id);
    return json(req, res, requestId, 201, { ...session, user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) });
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const body = await bodyOf(req);
    const email = cleanText(body.email, 160).toLocaleLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !verifyPassword(String(body.password || ''), user.password_hash)) throw new HttpError(401, 'Email or password is incorrect.');
    return json(req, res, requestId, 200, { ...createSession(db, user.id), user: publicUser(user) });
  }

  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    requireUser(req, db);
    const token = String(req.headers.authorization).slice(7).trim();
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
    return json(req, res, requestId, 200, { ok: true });
  }

  if (req.method === 'GET' && pathname === '/api/me') {
    return json(req, res, requestId, 200, publicUser(requireUser(req, db)));
  }

  if (req.method === 'GET' && pathname === '/api/dashboard') {
    const user = requireUser(req, db, 'student');
    return json(req, res, requestId, 200, studentDashboard(db, user));
  }

  if (req.method === 'GET' && pathname === '/api/teacher/dashboard') {
    const teacher = requireUser(req, db, 'teacher');
    return json(req, res, requestId, 200, teacherDashboard(db, teacher));
  }

  if (req.method === 'PUT' && pathname === '/api/profile') {
    const user = requireUser(req, db);
    const body = await bodyOf(req);
    const name = cleanText(body.name ?? user.name, 40);
    const proficiency = ['Beginner', 'Intermediate', 'Advanced'].includes(body.proficiency) ? body.proficiency : user.proficiency;
    const learningGoal = cleanText(body.learningGoal ?? user.learning_goal, 300);
    const dailyGoal = clampInteger(body.dailyGoal, 5, 180, user.daily_goal);
    if (name.length < 2) throw new HttpError(400, 'Name must contain at least 2 characters.');
    db.prepare(`UPDATE users SET name = ?, proficiency = ?, learning_goal = ?, daily_goal = ?, onboarding_complete = 1 WHERE id = ?`)
      .run(name, proficiency, learningGoal, dailyGoal, user.id);
    addActivity(db, user.id, { type: 'profile', icon: 'magic', title: 'Updated learner profile', detail: `${proficiency} · ${dailyGoal} minute daily goal` });
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    return json(req, res, requestId, 200, updated.role === 'student' ? studentDashboard(db, updated) : teacherDashboard(db, updated));
  }

  if (req.method === 'POST' && pathname === '/api/reset') {
    const user = requireUser(req, db, 'student');
    inTransaction(db, () => {
      ['lesson_attempts', 'progress', 'quick_attempts', 'vocabulary', 'speaking_attempts', 'activities'].forEach((table) => {
        db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(user.id);
      });
      db.prepare("UPDATE assignment_students SET status = 'assigned', completed_at = NULL WHERE student_id = ?").run(user.id);
      db.prepare('UPDATE users SET xp = 0 WHERE id = ?').run(user.id);
    });
    return json(req, res, requestId, 200, studentDashboard(db, db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)));
  }

  const lessonMatch = pathname.match(/^\/api\/lessons\/([^/]+)$/);
  if (req.method === 'GET' && lessonMatch) {
    const user = requireUser(req, db);
    const lessonId = decodeURIComponent(lessonMatch[1]);
    const row = user.role === 'student'
      ? publishedLessonRow(db, lessonId, user.id)
      : ownedLesson(db, lessonId, user.id);
    if (!row) throw new HttpError(404, 'Lesson not found.');
    return json(req, res, requestId, 200, lessonFromRow(db, row, user.role === 'teacher'));
  }

  const completeMatch = pathname.match(/^\/api\/lessons\/([^/]+)\/complete$/);
  if (req.method === 'POST' && completeMatch) {
    const user = requireUser(req, db, 'student');
    const row = publishedLessonRow(db, decodeURIComponent(completeMatch[1]), user.id);
    if (!row) throw new HttpError(404, 'Lesson not found.');
    return json(req, res, requestId, 200, submitLessonAttempt(db, user, row, await bodyOf(req)));
  }

  const checkpointMatch = pathname.match(/^\/api\/lessons\/([^/]+)\/checkpoint$/);
  if (req.method === 'PUT' && checkpointMatch) {
    const user = requireUser(req, db, 'student');
    const lessonId = decodeURIComponent(checkpointMatch[1]);
    if (!publishedLessonRow(db, lessonId, user.id)) throw new HttpError(404, 'Lesson not found.');
    const body = await bodyOf(req);
    const lastQuestion = clampInteger(body.lastQuestion, 0, 100, 0);
    const draftAnswers = Array.isArray(body.draftAnswers) ? body.draftAnswers.slice(0, 100) : [];
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO progress (user_id, lesson_id, status, last_question, draft_answers_json, updated_at)
      VALUES (?, ?, 'in_progress', ?, ?, ?)
      ON CONFLICT(user_id, lesson_id) DO UPDATE SET
        status = CASE WHEN progress.status = 'completed' THEN 'completed' ELSE 'in_progress' END,
        last_question = excluded.last_question, draft_answers_json = excluded.draft_answers_json, updated_at = excluded.updated_at`)
      .run(user.id, lessonId, lastQuestion, JSON.stringify(draftAnswers), now);
    return json(req, res, requestId, 200, { saved: true, updatedAt: now });
  }

  const studyMatch = pathname.match(/^\/api\/lessons\/([^/]+)\/study$/);
  if (req.method === 'PUT' && studyMatch) {
    const user = requireUser(req, db, 'student');
    const lessonId = decodeURIComponent(studyMatch[1]);
    if (!publishedLessonRow(db, lessonId, user.id)) throw new HttpError(404, 'Lesson not found.');
    const body = await bodyOf(req);
    const notes = cleanText(body.notes, 5000);
    const bookmarked = Boolean(body.bookmarked);
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO progress (user_id, lesson_id, status, bookmarked, notes, updated_at)
      VALUES (?, ?, 'not_started', ?, ?, ?)
      ON CONFLICT(user_id, lesson_id) DO UPDATE SET bookmarked = excluded.bookmarked, notes = excluded.notes, updated_at = excluded.updated_at`)
      .run(user.id, lessonId, bookmarked ? 1 : 0, notes, now);
    return json(req, res, requestId, 200, { saved: true, bookmarked, notes });
  }

  const speakingMatch = pathname.match(/^\/api\/lessons\/([^/]+)\/speaking-attempt$/);
  if (req.method === 'POST' && speakingMatch) {
    const user = requireUser(req, db, 'student');
    const row = publishedLessonRow(db, decodeURIComponent(speakingMatch[1]), user.id);
    if (!row || !row.speak_phrase) throw new HttpError(404, 'Speaking exercise not found.');
    const transcript = cleanText((await bodyOf(req)).transcript, 2000);
    if (!transcript) throw new HttpError(400, 'No speech transcript was received.');
    const accuracy = wordAccuracy(row.speak_phrase, transcript);
    db.prepare(`INSERT INTO speaking_attempts (id, user_id, lesson_id, transcript, accuracy, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(uniqueId('speaking'), user.id, row.id, transcript, accuracy, new Date().toISOString());
    addActivity(db, user.id, { type: 'speaking', icon: 'mic', title: `Practised ${row.title}`, detail: `${accuracy}% phrase accuracy` });
    return json(req, res, requestId, 200, { transcript, accuracy, target: row.speak_phrase, feedback: accuracy >= 80 ? 'Clear pronunciation—excellent work!' : accuracy >= 55 ? 'Good start. Slow down and try once more.' : 'Listen again, then practise one phrase at a time.' });
  }

  if (req.method === 'GET' && pathname === '/api/quick-quiz') {
    requireUser(req, db, 'student');
    const index = Math.floor(Math.random() * quickQuestions.length);
    const { answer, explanation, ...question } = quickQuestions[index];
    return json(req, res, requestId, 200, question);
  }

  if (req.method === 'POST' && pathname === '/api/quick-quiz/submit') {
    const user = requireUser(req, db, 'student');
    const body = await bodyOf(req);
    const question = quickQuestions.find((item) => item.id === body.questionId);
    if (!question) throw new HttpError(404, 'Question not found.');
    if (!Number.isInteger(body.answer) || body.answer < 0 || body.answer >= question.choices.length) throw new HttpError(400, 'Choose a valid answer.');
    const correct = body.answer === question.answer;
    const today = new Date().toISOString().slice(0, 10);
    const alreadyAwarded = db.prepare(`SELECT id FROM quick_attempts WHERE user_id = ? AND question_id = ? AND award_date = ? AND xp_awarded > 0`)
      .get(user.id, question.id, today);
    const xpAwarded = correct && !alreadyAwarded ? 20 : 0;
    inTransaction(db, () => {
      db.prepare(`INSERT INTO quick_attempts (id, user_id, question_id, answer, correct, xp_awarded, award_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(uniqueId('quick'), user.id, question.id, body.answer, correct ? 1 : 0, xpAwarded, today, new Date().toISOString());
      if (xpAwarded) db.prepare('UPDATE users SET xp = xp + ? WHERE id = ?').run(xpAwarded, user.id);
      addActivity(db, user.id, { type: 'quiz', icon: correct ? 'zap' : 'brain', title: correct ? 'Won a pop-up quiz' : 'Practised a pop-up quiz', detail: xpAwarded ? '+20 XP · Correct answer' : correct ? 'Correct · Daily XP already claimed' : 'Keep going · New knowledge gained' });
    });
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    return json(req, res, requestId, 200, { correct, answer: question.answer, explanation: question.explanation, xpAwarded, dashboard: studentDashboard(db, updated) });
  }

  if (req.method === 'POST' && pathname === '/api/vocabulary') {
    const user = requireUser(req, db, 'student');
    const body = await bodyOf(req);
    const term = cleanText(body.term, 100);
    const definition = cleanText(body.definition, 1000);
    if (!term) throw new HttpError(400, 'Enter a vocabulary word.');
    const item = { id: uniqueId('word'), term, definition, createdAt: new Date().toISOString() };
    db.prepare('INSERT INTO vocabulary (id, user_id, term, definition, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(item.id, user.id, term, definition, item.createdAt);
    return json(req, res, requestId, 201, item);
  }

  const vocabularyMatch = pathname.match(/^\/api\/vocabulary\/([^/]+)$/);
  if (req.method === 'DELETE' && vocabularyMatch) {
    const user = requireUser(req, db, 'student');
    db.prepare('DELETE FROM vocabulary WHERE id = ? AND user_id = ?').run(decodeURIComponent(vocabularyMatch[1]), user.id);
    return json(req, res, requestId, 200, { deleted: true });
  }

  if (req.method === 'POST' && pathname === '/api/teacher/courses') {
    const teacher = requireUser(req, db, 'teacher');
    const body = await bodyOf(req);
    const title = cleanText(body.title, 120);
    if (!title) throw new HttpError(400, 'Course title is required.');
    const id = uniqueId('course');
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO courses (id, teacher_id, title, description, difficulty, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`)
      .run(id, teacher.id, title, cleanText(body.description, 2000), cleanText(body.difficulty, 40) || 'Beginner', now, now);
    return json(req, res, requestId, 201, teacherDashboard(db, teacher));
  }

  const courseMatch = pathname.match(/^\/api\/teacher\/courses\/([^/]+)$/);
  if (req.method === 'PUT' && courseMatch) {
    const teacher = requireUser(req, db, 'teacher');
    const course = ownedCourse(db, decodeURIComponent(courseMatch[1]), teacher.id);
    const body = await bodyOf(req);
    const title = cleanText(body.title ?? course.title, 120);
    const status = ['draft', 'published', 'archived'].includes(body.status) ? body.status : course.status;
    if (!title) throw new HttpError(400, 'Course title is required.');
    if (status === 'published') {
      const publishedLessons = db.prepare("SELECT COUNT(*) AS count FROM lessons WHERE course_id = ? AND status = 'published'").get(course.id).count;
      if (!publishedLessons) throw new HttpError(400, 'Publish at least one lesson before publishing the course.');
    }
    db.prepare(`UPDATE courses SET title = ?, description = ?, difficulty = ?, status = ?, updated_at = ? WHERE id = ?`)
      .run(title, cleanText(body.description ?? course.description, 2000), cleanText(body.difficulty ?? course.difficulty, 40), status, new Date().toISOString(), course.id);
    if (status === 'published') {
      const enroll = db.prepare('INSERT OR IGNORE INTO enrollments (user_id, course_id, enrolled_at) VALUES (?, ?, ?)');
      db.prepare("SELECT id FROM users WHERE role = 'student'").all().forEach((student) => enroll.run(student.id, course.id, new Date().toISOString()));
    }
    return json(req, res, requestId, 200, teacherDashboard(db, teacher));
  }

  const moduleMatch = pathname.match(/^\/api\/teacher\/courses\/([^/]+)\/modules$/);
  if (req.method === 'POST' && moduleMatch) {
    const teacher = requireUser(req, db, 'teacher');
    const course = ownedCourse(db, decodeURIComponent(moduleMatch[1]), teacher.id);
    const body = await bodyOf(req);
    const title = cleanText(body.title, 120);
    if (!title) throw new HttpError(400, 'Module title is required.');
    const position = db.prepare('SELECT COUNT(*) AS count FROM modules WHERE course_id = ?').get(course.id).count;
    db.prepare('INSERT INTO modules (id, course_id, title, position) VALUES (?, ?, ?, ?)').run(uniqueId('module'), course.id, title, position);
    return json(req, res, requestId, 201, teacherDashboard(db, teacher));
  }

  if (req.method === 'POST' && pathname === '/api/teacher/lessons') {
    const teacher = requireUser(req, db, 'teacher');
    const body = await bodyOf(req);
    const input = normalizeLesson(body, body.status === 'published');
    const course = ownedCourse(db, input.courseId, teacher.id);
    if (input.moduleId && !db.prepare('SELECT id FROM modules WHERE id = ? AND course_id = ?').get(input.moduleId, course.id)) throw new HttpError(400, 'Module does not belong to this course.');
    const id = uniqueId('lesson');
    const now = new Date().toISOString();
    inTransaction(db, () => {
      db.prepare(`INSERT INTO lessons
        (id, course_id, module_id, title, category, eyebrow, icon, minutes, difficulty, passage, audio_text, speak_phrase,
         audio_url, video_url, resource_url, objectives_json, xp_reward, mastery_score, position, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, input.courseId, input.moduleId, input.title, input.category, input.eyebrow, input.icon,
          input.minutes, input.difficulty, input.passage, input.audioText, input.speakPhrase, input.audioUrl, input.videoUrl, input.resourceUrl,
          JSON.stringify(input.objectives), input.xpReward, input.masteryScore, input.position, input.status, now, now);
      saveQuestions(db, id, input.questions);
    });
    return json(req, res, requestId, 201, { lesson: lessonFromRow(db, ownedLesson(db, id, teacher.id), true), dashboard: teacherDashboard(db, teacher) });
  }

  const teacherLessonMatch = pathname.match(/^\/api\/teacher\/lessons\/([^/]+)$/);
  if (req.method === 'PUT' && teacherLessonMatch) {
    const teacher = requireUser(req, db, 'teacher');
    const existing = ownedLesson(db, decodeURIComponent(teacherLessonMatch[1]), teacher.id);
    const body = await bodyOf(req);
    const merged = {
      ...lessonFromRow(db, existing, true),
      ...body,
      courseId: body.courseId ?? existing.course_id,
      moduleId: body.moduleId === undefined ? existing.module_id : body.moduleId,
      questions: body.questions ?? lessonQuestions(db, existing.id, true)
    };
    const input = normalizeLesson(merged, body.status === 'published');
    ownedCourse(db, input.courseId, teacher.id);
    const now = new Date().toISOString();
    inTransaction(db, () => {
      db.prepare(`UPDATE lessons SET course_id = ?, module_id = ?, title = ?, category = ?, eyebrow = ?, icon = ?, minutes = ?,
        difficulty = ?, passage = ?, audio_text = ?, speak_phrase = ?, audio_url = ?, video_url = ?, resource_url = ?, objectives_json = ?, xp_reward = ?, mastery_score = ?,
        position = ?, status = ?, updated_at = ? WHERE id = ?`)
        .run(input.courseId, input.moduleId, input.title, input.category, input.eyebrow, input.icon, input.minutes,
          input.difficulty, input.passage, input.audioText, input.speakPhrase, input.audioUrl, input.videoUrl, input.resourceUrl, JSON.stringify(input.objectives), input.xpReward,
          input.masteryScore, input.position, input.status, now, existing.id);
      saveQuestions(db, existing.id, input.questions);
    });
    return json(req, res, requestId, 200, { lesson: lessonFromRow(db, ownedLesson(db, existing.id, teacher.id), true), dashboard: teacherDashboard(db, teacher) });
  }

  if (req.method === 'DELETE' && teacherLessonMatch) {
    const teacher = requireUser(req, db, 'teacher');
    const lesson = ownedLesson(db, decodeURIComponent(teacherLessonMatch[1]), teacher.id);
    db.prepare("UPDATE lessons SET status = 'archived', updated_at = ? WHERE id = ?").run(new Date().toISOString(), lesson.id);
    return json(req, res, requestId, 200, teacherDashboard(db, teacher));
  }

  const publishMatch = pathname.match(/^\/api\/teacher\/lessons\/([^/]+)\/publish$/);
  if (req.method === 'POST' && publishMatch) {
    const teacher = requireUser(req, db, 'teacher');
    const lesson = ownedLesson(db, decodeURIComponent(publishMatch[1]), teacher.id);
    normalizeQuestions(lessonQuestions(db, lesson.id, true), true);
    if (lesson.category === 'listening' && !lesson.audio_text) throw new HttpError(400, 'Add an audio script before publishing.');
    if (lesson.category === 'speaking' && !lesson.speak_phrase) throw new HttpError(400, 'Add a speaking phrase before publishing.');
    db.prepare("UPDATE lessons SET status = 'published', updated_at = ? WHERE id = ?").run(new Date().toISOString(), lesson.id);
    return json(req, res, requestId, 200, teacherDashboard(db, teacher));
  }

  const assignmentMatch = pathname.match(/^\/api\/teacher\/lessons\/([^/]+)\/assign$/);
  if (req.method === 'POST' && assignmentMatch) {
    const teacher = requireUser(req, db, 'teacher');
    const lesson = ownedLesson(db, decodeURIComponent(assignmentMatch[1]), teacher.id);
    if (lesson.status !== 'published') throw new HttpError(400, 'Publish the lesson before assigning it.');
    const body = await bodyOf(req);
    const requestedIds = Array.isArray(body.studentIds) ? body.studentIds.map(String) : [];
    const eligible = db.prepare(`SELECT DISTINCT u.id FROM users u JOIN enrollments e ON e.user_id = u.id
      WHERE e.course_id = ? AND u.role = 'student'`).all(lesson.course_id).map((row) => row.id);
    const studentIds = requestedIds.length ? requestedIds.filter((id) => eligible.includes(id)) : eligible;
    if (!studentIds.length) throw new HttpError(400, 'Select at least one enrolled student.');
    const assignmentId = uniqueId('assignment');
    const now = new Date().toISOString();
    inTransaction(db, () => {
      db.prepare(`INSERT INTO assignments (id, teacher_id, course_id, lesson_id, title, due_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(assignmentId, teacher.id, lesson.course_id, lesson.id, cleanText(body.title, 160) || lesson.title, optionalIsoDate(body.dueAt), now);
      const insert = db.prepare('INSERT INTO assignment_students (assignment_id, student_id) VALUES (?, ?)');
      studentIds.forEach((studentId) => insert.run(assignmentId, studentId));
    });
    return json(req, res, requestId, 201, teacherDashboard(db, teacher));
  }

  const analyticsMatch = pathname.match(/^\/api\/teacher\/lessons\/([^/]+)\/analytics$/);
  if (req.method === 'GET' && analyticsMatch) {
    const teacher = requireUser(req, db, 'teacher');
    const lesson = ownedLesson(db, decodeURIComponent(analyticsMatch[1]), teacher.id);
    const attempts = db.prepare(`SELECT la.id, u.id AS studentId, u.name AS studentName, la.score, la.passed,
      la.correct_count AS correct, la.total_count AS total, la.duration_seconds AS durationSeconds, la.created_at AS createdAt
      FROM lesson_attempts la JOIN users u ON u.id = la.user_id WHERE la.lesson_id = ? ORDER BY la.created_at DESC`).all(lesson.id);
    const questionRows = lessonQuestions(db, lesson.id, true);
    const questionAnalytics = questionRows.map((question, index) => {
      const answered = attempts.map((attempt) => db.prepare('SELECT answers_json FROM lesson_attempts WHERE id = ?').get(attempt.id))
        .map((row) => parseJson(row.answers_json, [])[index]);
      const correctCount = answered.filter((answer) => question.type === 'fill_blank'
        ? String(answer || '').trim().toLocaleLowerCase() === String(question.answer).trim().toLocaleLowerCase()
        : answer === question.answer).length;
      return { prompt: question.prompt, attempts: answered.length, correctRate: answered.length ? Math.round((correctCount / answered.length) * 100) : 0 };
    });
    return json(req, res, requestId, 200, {
      lesson: { id: lesson.id, title: lesson.title }, attempts,
      summary: { attempts: attempts.length, averageScore: attempts.length ? Math.round(attempts.reduce((sum, item) => sum + item.score, 0) / attempts.length) : 0, passRate: attempts.length ? Math.round((attempts.filter((item) => item.passed).length / attempts.length) * 100) : 0 },
      questions: questionAnalytics
    });
  }

  if (req.method === 'POST' && pathname === '/api/teacher/announcements') {
    const teacher = requireUser(req, db, 'teacher');
    const body = await bodyOf(req);
    const course = ownedCourse(db, cleanText(body.courseId, 100), teacher.id);
    const title = cleanText(body.title, 160);
    const message = cleanText(body.body, 5000);
    if (!title || !message) throw new HttpError(400, 'Announcement title and message are required.');
    db.prepare(`INSERT INTO announcements (id, teacher_id, course_id, title, body, published_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(uniqueId('announcement'), teacher.id, course.id, title, message, new Date().toISOString());
    return json(req, res, requestId, 201, teacherDashboard(db, teacher));
  }

  return json(req, res, requestId, 404, { error: 'Route not found.' });
}

export function createServer({ databaseFile = defaultDatabaseFile } = {}) {
  const db = createDatabase({ filename: databaseFile });
  const limits = new Map();
  const server = http.createServer(async (req, res) => {
    const requestId = randomUUID();
    const started = Date.now();
    try {
      const key = req.socket.remoteAddress || 'unknown';
      const now = Date.now();
      const existing = limits.get(key);
      const current = !existing || existing.resetAt <= now ? { count: 0, resetAt: now + 60000 } : existing;
      current.count += 1;
      limits.set(key, current);
      if (current.count > 180) throw new HttpError(429, 'Too many requests. Please wait a moment.');
      const pathname = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).pathname;
      if (pathname.startsWith('/api/')) await api(req, res, pathname, db, requestId);
      else if (pathname === '/') json(req, res, requestId, 200, { name: 'Pixel English Quest API', status: 'ok', health: '/api/health' });
      else json(req, res, requestId, 404, { error: 'Route not found.' });
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if (!res.headersSent) json(req, res, requestId, status, { error: status === 500 ? 'Internal server error.' : error.message, requestId });
      if (status === 500) console.error(JSON.stringify({ requestId, error: error?.stack || String(error) }));
    } finally {
      console.log(JSON.stringify({ requestId, method: req.method, path: req.url, status: res.statusCode, durationMs: Date.now() - started }));
    }
  });
  server.on('close', () => db.close());
  return server;
}
