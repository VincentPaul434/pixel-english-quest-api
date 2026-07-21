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

create index if not exists idx_classroom_invites_classroom
  on classroom_invitations(classroom_id, created_at desc);
create index if not exists idx_join_requests_invitation
  on classroom_join_requests(invitation_id, status, requested_at desc);

alter table classroom_invitations enable row level security;
alter table classroom_join_requests enable row level security;
