alter table users add column if not exists account_status text not null default 'active';
