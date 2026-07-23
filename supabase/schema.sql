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

alter table users add column if not exists is_admin integer not null default 0;
alter table users add column if not exists email_verified_at text;
alter table users add column if not exists locale text not null default 'en';
alter table users add column if not exists notification_preferences_json text not null default '{}';
alter table users add column if not exists mfa_secret text;
alter table users add column if not exists mfa_enabled integer not null default 0;
alter table users add column if not exists mfa_recovery_codes_json text not null default '[]';
alter table users add column if not exists account_status text not null default 'active';
alter table courses add column if not exists catalog_visibility text not null default 'private';
alter table courses add column if not exists enrollment_mode text not null default 'invite';
alter table courses add column if not exists certificate_enabled integer not null default 1;
alter table courses add column if not exists prerequisite_course_id text;
alter table courses add column if not exists published_at text;
alter table lessons add column if not exists attempt_limit integer not null default 0;
alter table lessons add column if not exists shuffle_questions integer not null default 0;
alter table lessons add column if not exists available_from text;
alter table lessons add column if not exists available_until text;
alter table lessons add column if not exists publish_at text;
alter table lessons add column if not exists version integer not null default 1;
alter table questions add column if not exists question_kind text;
alter table questions add column if not exists points integer not null default 1;
alter table questions add column if not exists settings_json text not null default '{}';
alter table assignments add column if not exists instructions text not null default '';
alter table assignments add column if not exists submission_type text not null default 'quiz';
alter table assignments add column if not exists max_score integer not null default 100;
alter table assignments add column if not exists allow_resubmission integer not null default 1;

create table if not exists classrooms (
  id text primary key,
  teacher_id text not null references users(id),
  course_id text not null references courses(id) on delete cascade,
  name text not null,
  code text not null unique,
  starts_at text,
  ends_at text,
  created_at text not null
);

create table if not exists classroom_students (
  classroom_id text not null references classrooms(id) on delete cascade,
  student_id text not null references users(id) on delete cascade,
  enrolled_at text not null,
  primary key (classroom_id, student_id)
);

create table if not exists classroom_invitations (
  id text primary key,
  classroom_id text not null references classrooms(id) on delete cascade,
  assignment_id text references assignments(id) on delete cascade,
  created_by text not null references users(id),
  code text not null unique,
  approval_required integer not null default 1,
  usage_limit integer,
  uses_count integer not null default 0,
  expires_at text,
  revoked_at text,
  created_at text not null
);

create table if not exists classroom_join_requests (
  id text primary key,
  invitation_id text not null references classroom_invitations(id) on delete cascade,
  student_id text not null references users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  requested_at text not null,
  resolved_at text,
  resolved_by text references users(id),
  unique(invitation_id, student_id)
);

create table if not exists submissions (
  id text primary key,
  assignment_id text not null references assignments(id) on delete cascade,
  student_id text not null references users(id) on delete cascade,
  text_content text not null default '',
  attachment_url text,
  status text not null default 'submitted',
  score integer,
  feedback text not null default '',
  rubric_json text not null default '[]',
  submitted_at text not null,
  graded_at text,
  graded_by text references users(id),
  attempt_number integer not null default 1
);

create table if not exists discussions (
  id text primary key,
  course_id text not null references courses(id) on delete cascade,
  author_id text not null references users(id) on delete cascade,
  parent_id text references discussions(id) on delete cascade,
  body text not null,
  created_at text not null,
  edited_at text
);

create table if not exists notifications (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  link text,
  read_at text,
  created_at text not null
);

create table if not exists certificates (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  course_id text not null references courses(id) on delete cascade,
  verification_code text not null unique,
  issued_at text not null,
  unique(user_id, course_id)
);

create table if not exists audit_logs (
  id text primary key,
  actor_id text references users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata_json text not null default '{}',
  created_at text not null
);

create table if not exists lesson_versions (
  id text primary key,
  lesson_id text not null references lessons(id) on delete cascade,
  teacher_id text not null references users(id),
  version integer not null,
  snapshot_json text not null,
  created_at text not null
);

create table if not exists question_bank (
  id text primary key,
  teacher_id text not null references users(id) on delete cascade,
  prompt text not null,
  type text not null,
  choices_json text not null default '[]',
  answer_json text not null,
  explanation text not null default '',
  tags_json text not null default '[]',
  created_at text not null,
  updated_at text not null
);

create table if not exists calendar_events (
  id text primary key,
  course_id text references courses(id) on delete cascade,
  classroom_id text references classrooms(id) on delete cascade,
  creator_id text not null references users(id),
  title text not null,
  description text not null default '',
  starts_at text not null,
  ends_at text,
  event_type text not null default 'class',
  created_at text not null
);

create table if not exists attendance (
  event_id text not null references calendar_events(id) on delete cascade,
  student_id text not null references users(id) on delete cascade,
  status text not null default 'present',
  note text not null default '',
  marked_at text not null,
  primary key (event_id, student_id)
);

create table if not exists password_reset_tokens (
  token_hash text primary key,
  user_id text not null references users(id) on delete cascade,
  expires_at text not null,
  used_at text,
  created_at text not null
);

create table if not exists email_verification_tokens (
  token_hash text primary key,
  user_id text not null references users(id) on delete cascade,
  expires_at text not null,
  used_at text,
  created_at text not null
);

create index if not exists idx_notifications_user on notifications(user_id, read_at, created_at desc);
create index if not exists idx_submissions_assignment on submissions(assignment_id, student_id, submitted_at desc);
create index if not exists idx_discussions_course on discussions(course_id, created_at desc);
create index if not exists idx_audit_created on audit_logs(created_at desc);
create index if not exists idx_classroom_invites_classroom on classroom_invitations(classroom_id, created_at desc);
create index if not exists idx_join_requests_invitation on classroom_join_requests(invitation_id, status, requested_at desc);

-- The application API is the only data-access surface. With no public policies,
-- Supabase anon/authenticated clients cannot bypass the API's role checks.
alter table users enable row level security;
alter table sessions enable row level security;
alter table courses enable row level security;
alter table modules enable row level security;
alter table lessons enable row level security;
alter table questions enable row level security;
alter table enrollments enable row level security;
alter table lesson_attempts enable row level security;
alter table progress enable row level security;
alter table assignments enable row level security;
alter table assignment_students enable row level security;
alter table announcements enable row level security;
alter table quick_attempts enable row level security;
alter table vocabulary enable row level security;
alter table speaking_attempts enable row level security;
alter table activities enable row level security;
alter table classrooms enable row level security;
alter table classroom_students enable row level security;
alter table classroom_invitations enable row level security;
alter table classroom_join_requests enable row level security;
alter table submissions enable row level security;
alter table discussions enable row level security;
alter table notifications enable row level security;
alter table certificates enable row level security;
alter table audit_logs enable row level security;
alter table lesson_versions enable row level security;
alter table question_bank enable row level security;
alter table calendar_events enable row level security;
alter table attendance enable row level security;
alter table password_reset_tokens enable row level security;
alter table email_verification_tokens enable row level security;
