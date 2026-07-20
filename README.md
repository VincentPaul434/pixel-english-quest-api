# Pixel English Quest API

The database-backed API for the English Pixel Academy learning system. It uses Node.js built-ins only: `node:http`, `node:crypto`, and Node's SQLite module.

## Requirements

- Node.js 24 or newer
- npm dependencies installed with `npm install`
- Optional Supabase Postgres project for cloud database setup

## Start locally

```bash
npm install
npm run dev
```

The API listens on `http://localhost:3001`. On first start it creates `academy.db`, seeds the starter curriculum, and safely imports the previous `data.json` demo profile when present.

## Demo accounts

| Role | Email | Password |
|---|---|---|
| Teacher | `teacher@pixel.academy` | `Teach123!` |
| Student | `student@pixel.academy` | `Learn123!` |

Change or remove demo accounts before a public deployment.

## Commands

```bash
npm run check
npm test
npm start
```

## Configuration

- `PORT`: HTTP port, default `3001`
- `ACADEMY_DB_FILE`: SQLite file path, default `academy.db`
- `SUPABASE_DB_URL` or `DATABASE_URL`: Supabase Postgres connection string for the setup script
- `PGSSLMODE`: set to `disable` only for a non-SSL local Postgres database; Supabase should use SSL
- `ALLOWED_ORIGINS`: comma-separated frontend origins
- `ALLOWED_ORIGIN_HOSTS`: comma-separated frontend hostnames; useful when a host injects its generated domain
- `TEACHER_INVITE_CODE`: optional code required when registering new teacher accounts

## Supabase database setup

Create a Supabase project, then copy the Postgres connection string from **Project Settings > Database > Connection string**. Use the pooled or direct URI, replacing `[YOUR-PASSWORD]` with the database password.

```bash
SUPABASE_DB_URL="postgresql://postgres:[YOUR-PASSWORD]@db.your-project.supabase.co:5432/postgres" npm run supabase:setup
```

The setup command runs `supabase/schema.sql` and seeds the same demo curriculum and demo accounts used by the local SQLite database. If the database already has users, it creates any missing tables but leaves existing data unchanged.

## Implemented platform capabilities

- Password-hashed student and teacher accounts
- Expiring bearer sessions and role authorization
- SQLite persistence with foreign keys, WAL mode, migrations, and transactional writes
- Course, module, lesson, and question authoring
- Draft, published, and archived content states
- Multiple-choice, true/false, and fill-in-the-blank assessment
- Enrollments, assignments, due dates, and completion tracking
- Every lesson attempt, answer, score, duration, and best-score progress
- Saved lesson checkpoints, draft answers, notes, and bookmarks
- Skill mastery, streaks, achievements, XP, levels, and activity records
- Teacher announcements, student analytics, and question-level performance
- Vocabulary study decks and speaking-attempt transcripts
- Request-size limits, rate limiting, restricted CORS, security headers, and request IDs
- Per-user progress reset instead of a global destructive reset

## Route groups

### Authentication and profiles

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/me`
- `PUT /api/profile`

### Student learning

- `GET /api/dashboard`
- `GET /api/lessons/:id`
- `POST /api/lessons/:id/complete`
- `PUT /api/lessons/:id/checkpoint`
- `PUT /api/lessons/:id/study`
- `POST /api/lessons/:id/speaking-attempt`
- `GET /api/quick-quiz`
- `POST /api/quick-quiz/submit`
- `POST /api/vocabulary`
- `DELETE /api/vocabulary/:id`
- `POST /api/reset`

### Teacher workspace

- `GET /api/teacher/dashboard`
- `POST /api/teacher/courses`
- `PUT /api/teacher/courses/:id`
- `POST /api/teacher/courses/:id/modules`
- `POST /api/teacher/lessons`
- `PUT /api/teacher/lessons/:id`
- `DELETE /api/teacher/lessons/:id`
- `POST /api/teacher/lessons/:id/publish`
- `POST /api/teacher/lessons/:id/assign`
- `GET /api/teacher/lessons/:id/analytics`
- `POST /api/teacher/announcements`

## Production deployment notes

The root `render.yaml` is a single Render Blueprint for both repositories. It creates:

- a Singapore Node web service for this API
- a 1 GB persistent disk mounted at `/var/data`
- a free static site built from the frontend repository
- cross-service environment variables for the API URL and restricted CORS

The API service uses Render's paid `starter` plan because persistent disks are not available on a free web service. Review the plan in Render before deploying the Blueprint.

Back up the SQLite database and its WAL files together, or use SQLite's online backup mechanism. Run one application writer instance per database file. For horizontal scaling, replace the storage adapter with PostgreSQL while keeping the API contracts.

Hosted email delivery, cloud object storage, and commercial speech-scoring services are intentionally not bundled. The local app uses hosted media URLs and browser speech recognition so every implemented workflow remains runnable without service credentials.
