alter table users add column if not exists mfa_recovery_codes_json text not null default '[]';
