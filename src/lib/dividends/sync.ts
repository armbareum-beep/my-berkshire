/**
 * 배당 자동 동기화 — STEP B.
 *
 * 배당은 결정적(배당락일·DPS·보유수량 모두 계산 가능)이므로 사용자 입력 없이 생성한다.
 * 대시보드 렌더 후 after()에서 호출 → 응답을 막지 않고 백그라운드 정산.
 *
 * 멱등성(idempotent): (계좌, 종목, 배당락일)별로 이미 배당 이벤트가 있으면 건너뛴다.
 * 따라서 매 방문마다 호출해도 중복 생성되지 않는다.
 *
 * 모드 무관: 보유수량을 "배당락일 시점"으로 복원하므로,
 *  · 장부(ledger): 과거 보유분에 대한 배당까지 소급 채움.
 *  · 챌린지: 매수가 오늘로 고정 → 과거 배당락일엔 보유 0 → 자연히 건너뜀(앞으로 받는 것만).
 *
 * 한계(추후 정밀 마일스톤): ₩ 환산은 "현재" 환율 사용(배당락 시점 환율 아님),
 *  외국납부세액공제·ISA 한도 등 정밀 세제 미반영(계좌유형별 1차 근사만, lib/config/tax).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { activeEventRows } from "@/lib/portfolio";
import { getDividends } from "@/lib/finance/dividends";
import { getFxToKrw } from "@/lib/finance/fx";
import { getTaxConfig, type AccountType } from "@/lib/config/tax";
import { todayKST } from "@/lib/date";
import { getActiveHolding } from "@/lib/holdings";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type EventInsert = Database["public"]["Tables"]["events"]["Insert"];

interface AccountInfo {
  id: string;
  accountType: AccountType;
}

/** 특정 계좌·종목의 배당락일 시점 순보유수량(매수 − 매도, date ≤ exDate). */
function sharesAt(
  rows: EventRow[],
  accountId: string,
  symbol: string,
  exDate: string,
): number {
  let q = 0;
  for (const r of rows) {
    if (r.account_id !== accountId || r.symbol !== symbol) continue;
    if (r.date > exDate) continue;
    if (r.type === "BUY") q += Number(r.quantity ?? 0);
    else if (r.type === "SELL") q -= Number(r.quantity ?? 0);
  }
  return q;
}

/**
 * 활성 holding 의 보유 종목에 대해 야후 배당 피드를 받아 누락된 DIVIDEND 이벤트를 생성한다.
 * @returns 새로 생성한 배당 이벤트 수.
 */
export async function syncDividends(
  supabase: SupabaseClient<Database>,
): Promise<{ created: number }> {
  const holding = await getActiveHolding(supabase);
  if (!holding) return { created: 0 };

  const { data: accountRows } = await supabase
    .from("accounts")
    .select("id, account_type")
    .eq("holding_id", holding.id);
  if (!accountRows || accountRows.length === 0) return { created: 0 };
  const accounts: AccountInfo[] = accountRows.map((a) => ({
    id: a.id,
    accountType: a.account_type,
  }));
  const accountIds = accounts.map((a) => a.id);

  const { data: rawRows } = await supabase
    .from("events")
    .select("*")
    .in("account_id", accountIds);
  const rows = activeEventRows(rawRows ?? []);
  if (rows.length === 0) return { created: 0 };

  // 보유한 적 있는 모든 종목(현재 0주여도 과거 보유분 배당 대상).
  const symbols = [
    ...new Set(
      rows
        .filter((r) => r.type === "BUY" && r.symbol)
        .map((r) => r.symbol as string),
    ),
  ];
  if (symbols.length === 0) return { created: 0 };

  // 조회 창: 가장 이른 이벤트일 → 오늘.
  const today = todayKST();
  const earliest = rows.reduce<string>(
    (min, r) => (r.date < min ? r.date : min),
    today,
  );

  const feed = await getDividends(symbols, earliest, today);
  if (Object.keys(feed).length === 0) return { created: 0 };

  // 피드 통화 → 현재 ₩ 환율.
  const fxCurrencies = [
    ...new Set(Object.values(feed).map((f) => f.currency)),
  ];
  const fx = await getFxToKrw(fxCurrencies);

  // dedup: 이미 존재하는 DIVIDEND (계좌|종목|날짜) — 수동 입력과도 중복 방지.
  const existingDiv = new Set(
    rows
      .filter((r) => r.type === "DIVIDEND" && r.symbol)
      .map((r) => `${r.account_id}|${r.symbol}|${r.date}`),
  );

  const inserts: EventInsert[] = [];
  for (const account of accounts) {
    const taxRate = getTaxConfig(account.accountType).dividendTaxRate;
    for (const symbol of symbols) {
      const sd = feed[symbol];
      if (!sd) continue;
      const rate = sd.currency === "KRW" ? 1 : fx[sd.currency];
      if (!rate) continue; // 환율 못 받은 통화는 건너뜀(잘못된 ₩ 기록 방지)

      for (const pay of sd.payments) {
        const key = `${account.id}|${symbol}|${pay.exDate}`;
        if (existingDiv.has(key)) continue;

        const shares = sharesAt(rows, account.id, symbol, pay.exDate);
        if (shares <= 0) continue;

        const grossKrw = pay.amountNative * shares * rate;
        if (!(grossKrw > 0)) continue;
        const taxKrw = grossKrw * taxRate;

        inserts.push({
          account_id: account.id,
          type: "DIVIDEND",
          symbol,
          quantity: null,
          price_or_amount: grossKrw, // 배당 총액(₩)
          fee_and_tax: taxKrw, // 원천징수세(₩) — 순액 = 총액 − 세금
          date: pay.exDate,
          currency: sd.currency,
          fx_rate: rate,
          source: "auto",
        });
        existingDiv.add(key); // 같은 실행 내 중복 방지
      }
    }
  }

  if (inserts.length === 0) return { created: 0 };
  const { error } = await supabase.from("events").insert(inserts);
  if (error) return { created: 0 };
  return { created: inserts.length };
}
