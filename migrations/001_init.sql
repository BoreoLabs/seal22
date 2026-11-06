create table users (
  id text primary key,
  name text not null,
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table sessions (
  token_hash text primary key,
  user_id text not null references users (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index sessions_user_id_idx on sessions (user_id);

create table projects (
  id text primary key,
  user_id text not null references users (id) on delete cascade,
  title text not null,
  kind text not null,
  accent text not null,
  spec jsonb not null,
  spent_usd numeric(10, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_user_id_idx on projects (user_id);

create table turns (
  id text primary key,
  project_id text not null references projects (id) on delete cascade,
  prompt text not null,
  reply text not null,
  cost_usd numeric(10, 2) not null,
  duration_ms integer not null,
  compiled boolean,
  created_at timestamptz not null default now()
);

create index turns_project_id_idx on turns (project_id);

create table project_files (
  project_id text not null references projects (id) on delete cascade,
  path text not null,
  contents text not null,
  primary key (project_id, path)
);

create table sandbox_runs (
  id text primary key,
  project_id text not null references projects (id) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  ok boolean not null,
  compiled boolean not null,
  duration_ms integer not null,
  log text not null,
  created_at timestamptz not null default now()
);

create index sandbox_runs_project_idx on sandbox_runs (project_id);
