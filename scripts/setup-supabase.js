import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { lessons } from '../src/lesson/lesson.seed.js';
import { DEMO_ACCOUNTS, hashPassword } from '../src/config/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('Set SUPABASE_DB_URL or DATABASE_URL to your Supabase Postgres connection string.');
  process.exit(1);
}

const ssl = process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false };
const client = new pg.Client({ connectionString: databaseUrl, ssl });

async function insert(sql, params) {
  await client.query(sql, params);
}

async function seedDemoData() {
  const existing = await client.query('select count(*)::int as count from users');
  if (existing.rows[0].count > 0) {
    console.log('Supabase database already has users; leaving existing data unchanged.');
    return;
  }

  const now = new Date().toISOString();
  const teacherId = 'teacher-demo';
  const studentId = 'student-demo';
  const courseId = 'course-english-foundations';
  const moduleIds = {
    reading: 'module-reading',
    grammar: 'module-grammar',
    listening: 'module-listening',
    speaking: 'module-speaking'
  };
  const moduleTitles = {
    reading: 'Story Trails',
    grammar: 'Sentence Craft',
    listening: 'Listening Paths',
    speaking: 'Speaking Guild'
  };

  await insert(
    `insert into users
      (id, email, password_hash, name, role, proficiency, learning_goal, daily_goal, onboarding_complete, xp, created_at)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [teacherId, DEMO_ACCOUNTS.teacher.email, hashPassword(DEMO_ACCOUNTS.teacher.password), 'Professor Nova', 'teacher', 'Advanced', 'Guide every learner', 20, 1, 0, now]
  );
  await insert(
    `insert into users
      (id, email, password_hash, name, role, proficiency, learning_goal, daily_goal, onboarding_complete, xp, created_at)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [studentId, DEMO_ACCOUNTS.student.email, hashPassword(DEMO_ACCOUNTS.student.password), 'Pixel Learner', 'student', 'Beginner', 'Speak and understand everyday English', 15, 1, 0, now]
  );
  await insert(
    `insert into courses (id, teacher_id, title, description, difficulty, status, created_at, updated_at)
      values ($1, $2, $3, $4, $5, 'published', $6, $7)`,
    [courseId, teacherId, 'English Adventure Foundations', 'A guided journey through reading, grammar, listening, and speaking.', 'Beginner', now, now]
  );

  let modulePosition = 0;
  for (const [category, id] of Object.entries(moduleIds)) {
    await insert(
      'insert into modules (id, course_id, title, position) values ($1, $2, $3, $4)',
      [id, courseId, moduleTitles[category], modulePosition]
    );
    modulePosition += 1;
  }

  for (const [lessonPosition, lesson] of lessons.entries()) {
    await insert(
      `insert into lessons
        (id, course_id, module_id, title, category, eyebrow, icon, minutes, difficulty, passage, audio_text, speak_phrase,
         audio_url, video_url, resource_url, objectives_json, xp_reward, mastery_score, position, status, created_at, updated_at)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, null, null, null, $13, 100, 75, $14, 'published', $15, $16)`,
      [
        lesson.id,
        courseId,
        moduleIds[lesson.category],
        lesson.title,
        lesson.category,
        lesson.eyebrow,
        lesson.icon || lesson.category,
        lesson.minutes,
        lesson.difficulty,
        lesson.passage,
        lesson.audioText || null,
        lesson.speakPhrase || null,
        JSON.stringify([`Practise ${lesson.category} comprehension`, 'Build confident English habits']),
        lessonPosition,
        now,
        now
      ]
    );

    for (const [questionPosition, question] of lesson.questions.entries()) {
      const type = question.type || 'multiple_choice';
      await insert(
        `insert into questions
          (id, lesson_id, prompt, type, choices_json, answer_json, explanation, position)
          values (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7)`,
        [
          lesson.id,
          question.prompt,
          type,
          JSON.stringify(question.choices || (type === 'true_false' ? ['True', 'False'] : [])),
          JSON.stringify(question.answer),
          `Review the ${lesson.category} lesson and use the clues in the passage.`,
          questionPosition
        ]
      );
    }
  }

  await insert('insert into enrollments (user_id, course_id, enrolled_at) values ($1, $2, $3)', [studentId, courseId, now]);
  await insert(
    `insert into assignments (id, teacher_id, course_id, lesson_id, title, due_at, created_at)
      values ($1, $2, $3, $4, $5, $6, $7)`,
    ['assignment-welcome', teacherId, courseId, 'moonlit-map', 'First Academy Quest', new Date(Date.now() + 7 * 86400000).toISOString(), now]
  );
  await insert(
    'insert into assignment_students (assignment_id, student_id, status) values ($1, $2, $3)',
    ['assignment-welcome', studentId, 'assigned']
  );
  await insert(
    'insert into announcements (id, teacher_id, course_id, title, body, published_at) values ($1, $2, $3, $4, $5, $6)',
    ['announcement-welcome', teacherId, courseId, 'Welcome to the Academy', 'Complete one quest each day and use your notes to capture new words.', now]
  );

  console.log('Seeded Supabase demo data.');
}

try {
  await client.connect();
  const schema = await readFile(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
  await client.query('begin');
  await client.query(schema);
  await seedDemoData();
  await client.query('commit');
  console.log('Supabase setup complete.');
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
