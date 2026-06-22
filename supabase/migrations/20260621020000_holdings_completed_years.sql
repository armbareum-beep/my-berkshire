alter table holdings
  add column if not exists completed_years integer[] not null default '{}';
