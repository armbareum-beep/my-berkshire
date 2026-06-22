-- ETF 구성종목 캐시 — scripts/syncKrxEtfHoldings.ts 가 KRX 세션으로 채운다.
create table etf_holdings_cache (
  symbol      text primary key,              -- 6자리 ETF 코드
  holdings    jsonb not null default '[]',   -- [{symbol, name, weight}]
  source_date date not null,
  fetched_at  timestamptz not null default now()
);

alter table etf_holdings_cache enable row level security;

create policy "etf_holdings_cache_select_authed" on etf_holdings_cache
  for select using (auth.uid() is not null);
