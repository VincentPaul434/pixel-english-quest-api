# Pixel English Quest API

The database-backed API for the English Pixel Academy learning system. It runs on local SQLite or a Supabase Postgres database through the same service layer.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the feature-based backend organization standard and current source layout.

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
- `SUPABASE_DB_URL` or `DATABASE_URL`: Supabase Postgres connection string used by setup and the live API runtime
- `PGSSLMODE`: set to `disable` only for a non-SSL local Postgres database; Supabase should use SSL
- `ALLOWED_ORIGINS`: comma-separated frontend origins
- `ALLOWED_ORIGIN_HOSTS`: comma-separated frontend hostnames; useful when a host injects its generated domain
- `TEACHER_INVITE_CODE`: optional code required when registering new teacher accounts
- `EMAIL_WEBHOOK_URL`: optional email-provider webhook for verification and password-reset messages
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`: optional signed file-upload configuration

## Supabase database setup

Create a Supabase project, then copy the Postgres connection string from **Project Settings > Database > Connection string**. Use the pooled or direct URI, replacing `[YOUR-PASSWORD]` with the database password.

```bash
SUPABASE_DB_URL="postgresql://postgres:[YOUR-PASSWORD]@db.your-project.supabase.co:5432/postgres" npm run supabase:setup
```

The setup command runs `supabase/schema.sql` and seeds the same demo curriculum and demo accounts used by the local SQLite database. If the database already has users, it creates any missing tables but leaves existing data unchanged.

Run `npm run supabase:verify` for a read-only check of student, teacher, platform, and admin queries against the configured Supabase database.

## Implemented platform capabilities

- Password-hashed student and teacher accounts, email verification, password recovery, and optional authenticator MFA
- Expiring bearer sessions and role authorization
- Dual SQLite/Supabase Postgres persistence, migrations, transactions, pooling, and protected Supabase tables
- Course catalog, prerequisites, self-enrollment, classrooms, rosters, attendance, and calendar events
- Course, module, lesson, question-bank, version-history, duplication, and ordering tools
- Draft, published, and archived content states
- Multiple-choice, true/false, fill-in, essay, matching, and ordering assessment with points, attempt limits, and availability windows
- Assignments, text/file submissions, resubmission rules, rubric records, grading, and feedback
- Every lesson attempt, answer, score, duration, and best-score progress
- Saved lesson checkpoints, draft answers, notes, and bookmarks
- Skill mastery, streaks, achievements, XP, levels, and activity records
- Teacher announcements, student analytics, and question-level performance
- Course discussions, in-app notifications, CSV reports, completion certificates, verification codes, and admin audit logs
- Supabase Storage signed uploads when cloud storage credentials are configured
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

`vercel.json` and `api/index.js` expose the Node API as a Vercel Function. Configure `SUPABASE_DB_URL`, restricted CORS origins, and production email/storage values in the Vercel project. The frontend has its own Vercel configuration and should receive `VITE_API_URL` at build time.

The supplied Supabase schema enables RLS on every application table with no anon/authenticated client policies. The application API remains the only database access surface and uses its server-side Postgres connection for authorization-aware queries.
