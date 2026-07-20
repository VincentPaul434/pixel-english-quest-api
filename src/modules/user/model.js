import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { lessons as seedLessons } from '../lesson/index.js';

export const DEMO_ACCOUNTS = {
  teacher: { email: 'teacher@pixel.academy', password: 'Teach123!' },
  student: { email: 'student@pixel.academy', password: 'Learn123!' }
};

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const digest = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${digest}`;
}

export function verifyPassword(password, stored) {
  const [salt, digest] = String(stored || '').split(':');
  if (!salt || !digest) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(digest, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

function legacyDataFor(filename) {
  const legacyPath = path.join(path.dirname(filename), 'data.json');
  if (!existsSync(legacyPath)) return null;
  try {
    return JSON.parse(readFileSync(legacyPath, 'utf8'));
  } catch {
    return null;
  }
}

function schema(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('student', 'teacher')),
      proficiency TEXT NOT NULL DEFAULT 'Beginner',
      learning_goal TEXT NOT NULL DEFAULT 'Build everyday English confidence',
      daily_goal INTEGER NOT NULL DEFAULT 15 CHECK (daily_goal BETWEEN 5 AND 180),
      onboarding_complete INTEGER NOT NULL DEFAULT 0,
      xp INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      teacher_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      difficulty TEXT NOT NULL DEFAULT 'Beginner',
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS modules (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      module_id TEXT REFERENCES modules(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('reading', 'grammar', 'listening', 'speaking')),
      eyebrow TEXT NOT NULL DEFAULT 'English Quest',
      icon TEXT NOT NULL DEFAULT 'book',
      minutes INTEGER NOT NULL DEFAULT 5 CHECK (minutes BETWEEN 1 AND 240),
      difficulty TEXT NOT NULL DEFAULT 'Beginner',
      passage TEXT NOT NULL,
      audio_text TEXT,
      speak_phrase TEXT,
      audio_url TEXT,
      video_url TEXT,
      resource_url TEXT,
      objectives_json TEXT NOT NULL DEFAULT '[]',
      xp_reward INTEGER NOT NULL DEFAULT 100 CHECK (xp_reward BETWEEN 0 AND 5000),
      mastery_score INTEGER NOT NULL DEFAULT 75 CHECK (mastery_score BETWEEN 1 AND 100),
      position INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      prompt TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'multiple_choice' CHECK (type IN ('multiple_choice', 'true_false', 'fill_blank')),
      choices_json TEXT NOT NULL DEFAULT '[]',
      answer_json TEXT NOT NULL,
      explanation TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      enrolled_at TEXT NOT NULL,
      PRIMARY KEY (user_id, course_id)
    );

    CREATE TABLE IF NOT EXISTS lesson_attempts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      answers_json TEXT NOT NULL,
      score INTEGER NOT NULL,
      correct_count INTEGER NOT NULL,
      total_count INTEGER NOT NULL,
      passed INTEGER NOT NULL,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS progress (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
      best_score INTEGER NOT NULL DEFAULT 0,
      last_score INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_question INTEGER NOT NULL DEFAULT 0,
      draft_answers_json TEXT NOT NULL DEFAULT '[]',
      bookmarked INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      completed_at TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, lesson_id)
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id TEXT PRIMARY KEY,
      teacher_id TEXT NOT NULL REFERENCES users(id),
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      due_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assignment_students (
      assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'completed')),
      completed_at TEXT,
      PRIMARY KEY (assignment_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY,
      teacher_id TEXT NOT NULL REFERENCES users(id),
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      published_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quick_attempts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL,
      answer INTEGER NOT NULL,
      correct INTEGER NOT NULL,
      xp_awarded INTEGER NOT NULL DEFAULT 0,
      award_date TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vocabulary (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      term TEXT NOT NULL,
      definition TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS speaking_attempts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      transcript TEXT NOT NULL,
      accuracy INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT 'sparkle',
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_lessons_course ON lessons(course_id, position);
    CREATE INDEX IF NOT EXISTS idx_attempts_user ON lesson_attempts(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_user ON activities(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_assignment_student ON assignment_students(student_id, status);
  `);
}

function migrate(db) {
  const lessonColumns = new Set(db.prepare('PRAGMA table_info(lessons)').all().map((column) => column.name));
  const additions = [
    ['audio_url', 'TEXT'],
    ['video_url', 'TEXT'],
    ['resource_url', 'TEXT']
  ];
  for (const [name, definition] of additions) {
    if (!lessonColumns.has(name)) db.exec(`ALTER TABLE lessons ADD COLUMN ${name} ${definition}`);
  }
}

function insertQuestion(db, lessonId, question, position) {
  const type = question.type || 'multiple_choice';
  db.prepare(`INSERT INTO questions
    (id, lesson_id, prompt, type, choices_json, answer_json, explanation, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      randomUUID(), lessonId, question.prompt, type,
      JSON.stringify(question.choices || (type === 'true_false' ? ['True', 'False'] : [])),
      JSON.stringify(question.answer), question.explanation || '', position
    );
}

function seed(db, legacy) {
  const existing = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (existing) return;

  const now = new Date().toISOString();
  const teacherId = 'teacher-demo';
  const studentId = 'student-demo';
  const legacyName = String(legacy?.profile?.name || 'Pixel Learner').slice(0, 40);
  const legacyXp = Math.max(0, Number(legacy?.profile?.xp) || 0);

  db.prepare(`INSERT INTO users
    (id, email, password_hash, name, role, proficiency, learning_goal, daily_goal, onboarding_complete, xp, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(teacherId, DEMO_ACCOUNTS.teacher.email, hashPassword(DEMO_ACCOUNTS.teacher.password), 'Professor Nova', 'teacher', 'Advanced', 'Guide every learner', 20, 1, 0, now);
  db.prepare(`INSERT INTO users
    (id, email, password_hash, name, role, proficiency, learning_goal, daily_goal, onboarding_complete, xp, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(studentId, DEMO_ACCOUNTS.student.email, hashPassword(DEMO_ACCOUNTS.student.password), legacyName, 'student', 'Beginner', 'Speak and understand everyday English', 15, 1, legacyXp, now);

  const courseId = 'course-english-foundations';
  db.prepare(`INSERT INTO courses (id, teacher_id, title, description, difficulty, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'published', ?, ?)`)
    .run(courseId, teacherId, 'English Adventure Foundations', 'A guided journey through reading, grammar, listening, and speaking.', 'Beginner', now, now);

  const moduleIds = {
    reading: 'module-reading',
    grammar: 'module-grammar',
    listening: 'module-listening',
    speaking: 'module-speaking'
  };
  const moduleTitles = {
    reading: 'Story Trails', grammar: 'Sentence Craft', listening: 'Listening Paths', speaking: 'Speaking Guild'
  };
  Object.entries(moduleIds).forEach(([category, id], position) => {
    db.prepare('INSERT INTO modules (id, course_id, title, position) VALUES (?, ?, ?, ?)')
      .run(id, courseId, moduleTitles[category], position);
  });

  const insertLesson = db.prepare(`INSERT INTO lessons
    (id, course_id, module_id, title, category, eyebrow, icon, minutes, difficulty, passage, audio_text, speak_phrase,
     audio_url, video_url, resource_url, objectives_json, xp_reward, mastery_score, position, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)`);

  seedLessons.forEach((lesson, position) => {
    insertLesson.run(
      lesson.id, courseId, moduleIds[lesson.category], lesson.title, lesson.category, lesson.eyebrow,
      lesson.icon || lesson.category, lesson.minutes, lesson.difficulty, lesson.passage,
      lesson.audioText || null, lesson.speakPhrase || null, null, null, null,
      JSON.stringify([`Practise ${lesson.category} comprehension`, 'Build confident English habits']),
      100, 75, position, now, now
    );
    lesson.questions.forEach((question, questionPosition) => insertQuestion(db, lesson.id, {
      ...question,
      explanation: `Review the ${lesson.category} lesson and use the clues in the passage.`
    }, questionPosition));
  });

  db.prepare('INSERT INTO enrollments (user_id, course_id, enrolled_at) VALUES (?, ?, ?)')
    .run(studentId, courseId, now);

  const completed = new Set(Array.isArray(legacy?.completedLessons) ? legacy.completedLessons : []);
  for (const lessonId of completed) {
    if (!seedLessons.some((item) => item.id === lessonId)) continue;
    db.prepare(`INSERT INTO progress
      (user_id, lesson_id, status, best_score, last_score, attempts, last_question, draft_answers_json, bookmarked, notes, completed_at, updated_at)
      VALUES (?, ?, 'completed', 100, 100, 1, 0, '[]', 0, '', ?, ?)`)
      .run(studentId, lessonId, now, now);
  }

  const legacyActivities = Array.isArray(legacy?.activities) ? legacy.activities.slice(0, 30) : [];
  for (const activity of legacyActivities) {
    db.prepare(`INSERT OR IGNORE INTO activities (id, user_id, type, icon, title, detail, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(String(activity.id || randomUUID()), studentId, activity.type || 'lesson', activity.icon || 'sparkle', activity.title || 'Learning activity', activity.detail || '', activity.timestamp || now);
  }

  db.prepare(`INSERT INTO assignments (id, teacher_id, course_id, lesson_id, title, due_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run('assignment-welcome', teacherId, courseId, 'moonlit-map', 'First Academy Quest', new Date(Date.now() + 7 * 86400000).toISOString(), now);
  db.prepare(`INSERT INTO assignment_students (assignment_id, student_id, status) VALUES (?, ?, ?)`)
    .run('assignment-welcome', studentId, completed.has('moonlit-map') ? 'completed' : 'assigned');
  db.prepare(`INSERT INTO announcements (id, teacher_id, course_id, title, body, published_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run('announcement-welcome', teacherId, courseId, 'Welcome to the Academy', 'Complete one quest each day and use your notes to capture new words.', now);
}

export function createDatabase({ filename }) {
  const db = new DatabaseSync(filename);
  schema(db);
  migrate(db);
  const counts = db.prepare(`SELECT
    (SELECT COUNT(*) FROM users) AS users,
    (SELECT COUNT(*) FROM courses) AS courses`).get();
  const partialDemoSeed = counts.users === 1 && counts.courses === 0
    && Boolean(db.prepare("SELECT id FROM users WHERE id = 'teacher-demo'").get());
  if (partialDemoSeed) db.prepare("DELETE FROM users WHERE id = 'teacher-demo'").run();
  if (db.prepare('SELECT COUNT(*) AS count FROM users').get().count === 0) {
    inTransaction(db, () => seed(db, filename === ':memory:' ? null : legacyDataFor(filename)));
  }
  return db;
}

export function inTransaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    proficiency: row.proficiency,
    learningGoal: row.learning_goal,
    dailyGoal: row.daily_goal,
    onboardingComplete: Boolean(row.onboarding_complete),
    xp: row.xp,
    level: Math.floor(row.xp / 250) + 1
  };
}

export function addActivity(db, userId, activity) {
  db.prepare(`INSERT INTO activities (id, user_id, type, icon, title, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), userId, activity.type, activity.icon || 'sparkle', activity.title, activity.detail, new Date().toISOString());
}

export function uniqueId(prefix) {
  return `${prefix}-${randomUUID()}`;
}
