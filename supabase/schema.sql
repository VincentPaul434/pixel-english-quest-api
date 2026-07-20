create table if not exists users (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  name text not null,
  role text not null check (role in ('student', 'teacher')),
  proficiency text not null default 'Beginner',
  learning_goal text not null default 'Build everyday English confidence',
  daily_goal integer not null default 15 check (daily_goal between 5 and 180),
  onboarding_complete integer not null default 0,
  xp integer not null default 0,
  created_at text not null
);

create table if not exists sessions (
  token_hash text primary key,
  user_id text not null references users(id) on delete cascade,
  expires_at text not null,
  created_at text not null
);

create table if not exists courses (
  id text primary key,
  teacher_id text not null references users(id),
  title text not null,
  description text not null default '',
  difficulty text not null default 'Beginner',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at text not null,
  updated_at text not null
);

create table if not exists modules (
  id text primary key,
  course_id text not null references courses(id) on delete cascade,
  title text not null,
  position integer not null default 0
);

create table if not exists lessons (
  id text primary key,
  course_id text not null references courses(id) on delete cascade,
  module_id text references modules(id) on delete set null,
  title text not null,
  category text not null check (category in ('reading', 'grammar', 'listening', 'speaking')),
  eyebrow text not null default 'English Quest',
  icon text not null default 'book',
  minutes integer not null default 5 check (minutes between 1 and 240),
  difficulty text not null default 'Beginner',
  passage text not null,
  audio_text text,
  speak_phrase text,
  audio_url text,
  video_url text,
  resource_url text,
  objectives_json text not null default '[]',
  xp_reward integer not null default 100 check (xp_reward between 0 and 5000),
  mastery_score integer not null default 75 check (mastery_score between 1 and 100),
  position integer not null default 0,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at text not null,
  updated_at text not null
);

create table if not exists questions (
  id text primary key,
  lesson_id text not null references lessons(id) on delete cascade,
  prompt text not null,
  type text not null default 'multiple_choice' check (type in ('multiple_choice', 'true_false', 'fill_blank')),
  choices_json text not null default '[]',
  answer_json text not null,
  explanation text not null default '',
  position integer not null default 0
);

create table if not exists enrollments (
  user_id text not null references users(id) on delete cascade,
  course_id text not null references courses(id) on delete cascade,
  enrolled_at text not null,
  primary key (user_id, course_id)
);

create table if not exists lesson_attempts (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  lesson_id text not null references lessons(id) on delete cascade,
  answers_json text not null,
  score integer not null,
  correct_count integer not null,
  total_count integer not null,
  passed integer not null,
  duration_seconds integer not null default 0,
  created_at text not null
);

create table if not exists progress (
  user_id text not null references users(id) on delete cascade,
  lesson_id text not null references lessons(id) on delete cascade,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed')),
  best_score integer not null default 0,
  last_score integer not null default 0,
  attempts integer not null default 0,
  last_question integer not null default 0,
  draft_answers_json text not null default '[]',
  bookmarked integer not null default 0,
  notes text not null default '',
  completed_at text,
  updated_at text not null,
  primary key (user_id, lesson_id)
);

create table if not exists assignments (
  id text primary key,
  teacher_id text not null references users(id),
  course_id text not null references courses(id) on delete cascade,
  lesson_id text not null references lessons(id) on delete cascade,
  title text not null,
  due_at text,
  created_at text not null
);

create table if not exists assignment_students (
  assignment_id text not null references assignments(id) on delete cascade,
  student_id text not null references users(id) on delete cascade,
  status text not null default 'assigned' check (status in ('assigned', 'completed')),
  completed_at text,
  primary key (assignment_id, student_id)
);

create table if not exists announcements (
  id text primary key,
  teacher_id text not null references users(id),
  course_id text not null references courses(id) on delete cascade,
  title text not null,
  body text not null,
  published_at text not null
);

create table if not exists quick_attempts (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  question_id text not null,
  answer integer not null,
  correct integer not null,
  xp_awarded integer not null default 0,
  award_date text not null,
  created_at text not null
);

create table if not exists vocabulary (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  term text not null,
  definition text not null default '',
  created_at text not null
);

create table if not exists speaking_attempts (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  lesson_id text not null references lessons(id) on delete cascade,
  transcript text not null,
  accuracy integer not null,
  created_at text not null
);

create table if not exists activities (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  type text not null,
  icon text not null default 'sparkle',
  title text not null,
  detail text not null,
  created_at text not null
);

create index if not exists idx_lessons_course on lessons(course_id, position);
create index if not exists idx_attempts_user on lesson_attempts(user_id, created_at desc);
create index if not exists idx_activity_user on activities(user_id, created_at desc);
create index if not exists idx_assignment_student on assignment_students(student_id, status);
