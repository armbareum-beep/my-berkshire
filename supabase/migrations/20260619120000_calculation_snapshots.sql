-- User-specific derived data cache. Source data remains authoritative; snapshots
-- are addressed by the holding revision so stale rows never shadow fresh writes.

alter table holdings
  add column portfolio_revision bigint not null default 0;

create table calculation_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade default auth.uid(),
  holding_id          uuid not null references holdings (id) on delete cascade,
  kind                text not null,
  portfolio_revision  bigint not null,
  as_of_date          date not null,
  parameters_hash     text not null default '',
  data                jsonb not null,
  status              text not null default 'fresh'
                      check (status in ('fresh', 'stale', 'computing', 'failed')),
  computed_at         timestamptz not null default now(),
  expires_at          timestamptz,
  error_message       text,
  unique (holding_id, kind, portfolio_revision, as_of_date, parameters_hash)
);

create index calculation_snapshots_lookup_idx
  on calculation_snapshots
  (holding_id, kind, portfolio_revision, as_of_date, parameters_hash);

create index calculation_snapshots_expiry_idx
  on calculation_snapshots (expires_at);

alter table calculation_snapshots enable row level security;

create policy "calculation_snapshots_select_own" on calculation_snapshots
  for select using (
    user_id = auth.uid()
    and holding_id in (select id from holdings where user_id = auth.uid())
  );

create policy "calculation_snapshots_insert_own" on calculation_snapshots
  for insert with check (
    user_id = auth.uid()
    and holding_id in (select id from holdings where user_id = auth.uid())
  );

create policy "calculation_snapshots_update_own" on calculation_snapshots
  for update using (
    user_id = auth.uid()
    and holding_id in (select id from holdings where user_id = auth.uid())
  ) with check (
    user_id = auth.uid()
    and holding_id in (select id from holdings where user_id = auth.uid())
  );

create policy "calculation_snapshots_delete_own" on calculation_snapshots
  for delete using (
    user_id = auth.uid()
    and holding_id in (select id from holdings where user_id = auth.uid())
  );

create or replace function bump_holding_revision(target_holding_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update holdings
  set portfolio_revision = portfolio_revision + 1
  where id = target_holding_id;
$$;

create or replace function bump_revision_from_holding_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_holding_id uuid;
  new_holding_id uuid;
begin
  if tg_op <> 'INSERT' then
    old_holding_id := old.holding_id;
  end if;
  if tg_op <> 'DELETE' then
    new_holding_id := new.holding_id;
  end if;

  if old_holding_id is not null then
    perform bump_holding_revision(old_holding_id);
  end if;
  if new_holding_id is not null and new_holding_id is distinct from old_holding_id then
    perform bump_holding_revision(new_holding_id);
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function bump_revision_from_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_holding_id uuid;
  new_holding_id uuid;
begin
  if tg_op <> 'INSERT' then
    select holding_id into old_holding_id from accounts where id = old.account_id;
  end if;
  if tg_op <> 'DELETE' then
    select holding_id into new_holding_id from accounts where id = new.account_id;
  end if;

  if old_holding_id is not null then
    perform bump_holding_revision(old_holding_id);
  end if;
  if new_holding_id is not null and new_holding_id is distinct from old_holding_id then
    perform bump_holding_revision(new_holding_id);
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function bump_revision_from_holding_update()
returns trigger
language plpgsql
as $$
begin
  if new.initial_capital is distinct from old.initial_capital
    or new.initial_valuation is distinct from old.initial_valuation
    or new.founded_at is distinct from old.founded_at
    or new.target_weights is distinct from old.target_weights
    or new.category_targets is distinct from old.category_targets
    or new.active_plan is distinct from old.active_plan
  then
    new.portfolio_revision := old.portfolio_revision + 1;
  end if;
  return new;
end;
$$;

create trigger holdings_bump_portfolio_revision
  before update on holdings
  for each row execute function bump_revision_from_holding_update();

create trigger events_bump_portfolio_revision
  after insert or update or delete on events
  for each row execute function bump_revision_from_event();

create trigger accounts_bump_portfolio_revision
  after insert or update or delete on accounts
  for each row execute function bump_revision_from_holding_row();

create trigger liabilities_bump_portfolio_revision
  after insert or update or delete on liabilities
  for each row execute function bump_revision_from_holding_row();

create trigger manual_assets_bump_portfolio_revision
  after insert or update or delete on manual_assets
  for each row execute function bump_revision_from_holding_row();

create trigger manual_fundamentals_bump_portfolio_revision
  after insert or update or delete on manual_fundamentals
  for each row execute function bump_revision_from_holding_row();

create trigger valuation_assumptions_bump_portfolio_revision
  after insert or update or delete on valuation_assumptions
  for each row execute function bump_revision_from_holding_row();
