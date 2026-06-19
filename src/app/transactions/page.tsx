import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio, activeEventRows } from "@/lib/portfolio";
import {
  companyCashPools,
  netQuantities,
  type InvestmentEvent,
} from "@/lib/finance/valuation";
import { todayKST } from "@/lib/date";
import { getKrwPrices } from "@/lib/finance/prices";
import { getFxToKrw } from "@/lib/finance/fx";
import { CATALOG } from "@/lib/finance/catalog";
import { CURRENCIES } from "@/lib/finance/currencies";
import {
  TransactionFlow,
  type AccountOption,
} from "@/components/transactions/TransactionFlow";
import type { EventType } from "@/lib/finance/valuation";
import type { AccountType } from "@/lib/config/tax";
import type { Database } from "@/lib/supabase/database.types";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

const EVENT_TYPES: EventType[] = [
  "BUY",
  "SELL",
  "DIVIDEND",
  "DEPOSIT",
  "WITHDRAWAL",
  "EXCHANGE",
];

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    ccy?: string;
    symbol?: string;
    qty?: string;
    from?: string;
  }>;
}) {
  const { type, ccy, symbol, qty, from } = await searchParams;
  // 내부 경로만 허용(오픈 리다이렉트 방지)
  const returnTo = from && from.startsWith("/") ? from : undefined;
  const initialType = EVENT_TYPES.includes(type as EventType)
    ? (type as EventType)
    : undefined;
  const initialCcy = CURRENCIES.some((c) => c.code === ccy) ? ccy : undefined;
  const initialSymbol = symbol || undefined;
  const initialQty =
    qty && Number(qty) > 0 ? Math.floor(Number(qty)) : undefined;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const portfolio = await getPortfolio(supabase);
  if (!portfolio) redirect("/onboarding");

  const { data: accountRows } = await supabase
    .from("accounts")
    .select("id, name, account_type, commission_rate")
    .eq("holding_id", portfolio.holding.id)
    .order("created_at", { ascending: true });
  const accounts: AccountOption[] = (accountRows ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    accountType: a.account_type as AccountType,
    commissionRate: Number(a.commission_rate),
  }));

  // 계좌별 보유수량(매도 시 그 계좌의 보유만 보이도록)
  const accountIds = accounts.map((a) => a.id);
  const { data: eventRows } = accountIds.length
    ? await supabase.from("events").select("*").in("account_id", accountIds)
    : { data: [] };
  const mapRow = (r: EventRow): InvestmentEvent => ({
    type: r.type,
    symbol: r.symbol,
    quantity: r.quantity === null ? null : Number(r.quantity),
    priceOrAmount: Number(r.price_or_amount),
    feeAndTax: Number(r.fee_and_tax),
    date: r.date,
    currency: r.currency ?? "KRW",
    fxRate: r.fx_rate == null ? 1 : Number(r.fx_rate),
    toCurrency: r.to_currency,
    toAmount: r.to_amount == null ? null : Number(r.to_amount),
  });

  const positionsByAccount: Record<string, Record<string, number>> = {};
  for (const acc of accounts) {
    const active = activeEventRows(
      (eventRows ?? []).filter((r) => r.account_id === acc.id),
    );
    const nets = netQuantities(active.map(mapRow));
    const pos: Record<string, number> = {};
    for (const [s, q] of Object.entries(nets)) if (q !== 0) pos[s] = q;
    positionsByAccount[acc.id] = pos;
  }

  // 회사 통화별 현금 풀(네이티브) — 매수 시 "있던 현금 vs 증자/환전" 판단·표시용.
  const allActive = activeEventRows(eventRows ?? []);
  const pools = companyCashPools(
    allActive.map(mapRow),
    Number(portfolio.holding.initial_valuation),
  );

  const { prices } = await getKrwPrices(CATALOG.map((c) => c.symbol));
  // 모든 지원 통화 환율(증자/인출/환전 미리보기·매수자금 판정용)
  const fxRates = await getFxToKrw(CURRENCIES.map((c) => c.code));

  // 거래 입력은 "여정 중" 화면 — 하단 탭바 없음(이탈 방지, 디자인 §4). 자체 ‹ 뒤로만.
  return (
    <TransactionFlow
      mode={portfolio.holding.mode}
      today={todayKST()}
      accounts={accounts}
      positionsByAccount={positionsByAccount}
      pools={pools}
      fxRates={fxRates}
      initialType={initialType}
      initialCcy={initialCcy}
      initialSymbol={initialSymbol}
      initialQty={initialQty}
      returnTo={returnTo}
      // 카탈로그 시세 + 보유종목 시세(검색으로 산 종목 포함) 합쳐 seed
      prices={{ ...prices, ...portfolio.prices }}
      names={portfolio.names}
    />
  );
}
