"use server";

import { createClient } from "@/lib/supabase/server";
import { cashBalance, type InvestmentEvent } from "@/lib/finance/valuation";
import { getPrices } from "@/lib/finance/prices";
import { getFxToKrw } from "@/lib/finance/fx";
import { upsertSecurities } from "@/lib/securities";
import { todayKST } from "@/lib/date";
import type { AccountType } from "@/lib/config/tax";
import { getActiveHolding, setActiveHoldingCookie } from "@/lib/holdings";

export interface FoundingStock {
  symbol: string;
  name: string;
  quantity: number;
  avgPrice: number;
  buyDate?: string; // ledger 모드에서 과거 매수일 허용
  /** 설립 시 함께 만든 계좌 배열의 인덱스. 기본 0. */
  accountIndex?: number;
}

export interface FoundingAccount {
  name: string;
  accountType: AccountType;
}

export interface FoundInput {
  name: string;
  foundedAt: string; // 장부 — 사용자가 선택한 설립일
  stocks: FoundingStock[];
  cash: number;
  /** 첫 계좌 이름(자회사를 담는 그릇). 기본 "기본 계좌". */
  accountName?: string;
  /** 첫 계좌 유형(세금 파생). 기본 GENERAL. */
  accountType?: AccountType;
  /** 설립과 동시에 만들 계좌들. 첫 항목은 트리거가 만든 기본 계좌를 갱신한다. */
  accounts?: FoundingAccount[];
}

export interface CreatedAccount {
  id: string;
  name: string;
  accountType: AccountType;
  commissionRate: number;
}

type ActionResult =
  | { ok: true; holdingId: string; accounts?: CreatedAccount[] }
  | { ok: false; error: string };

/** J2 — 설립 등기: holdings + (트리거가) 기본계좌 + 설립 보유종목 BUY 이벤트. */
export async function foundCompany(input: FoundInput): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  if (!input.name.trim()) return { ok: false, error: "회사명을 입력하세요." };

  // 장부 — 사용자가 선택한 설립일.
  const foundedAt = input.foundedAt;

  // 장부는 사용자가 입력한 실제 매입 평단을 그대로 쓴다.
  // 외국 종목(USD 등)은 현재 환율로 ₩ 환산해 장부 기록(기능통화=KRW).
  let stocks = input.stocks;
  const stockCurrencies: Record<string, string> = {};
  const stockFx: Record<string, number> = {};
  const stockTypes: Record<string, string> = {};
  if (input.stocks.length) {
    const symbols = input.stocks.map((s) => s.symbol);
    const { currencies, instrumentTypes } = await getPrices(symbols);
    const fx = await getFxToKrw(Object.values(currencies));
    const converted: FoundingStock[] = [];
    for (const s of input.stocks) {
      const ccy = currencies[s.symbol] ?? "KRW";
      // 통화 안전장치: 해외(6자리 숫자 아님) 종목이 "KRW"면 통화 감지 실패
      //  → 외화 가격을 ₩ 환산 없이 저장하는 사고 방지(조용히 대체 금지).
      if (ccy === "KRW" && !/^\d{6}$/.test(s.symbol))
        return {
          ok: false,
          error: `${s.name} 통화를 확인하지 못했습니다. 잠시 후 다시 시도하세요.`,
        };
      stockCurrencies[s.symbol] = ccy;
      stockTypes[s.symbol] = instrumentTypes[s.symbol] ?? "EQUITY";
      // 장부: 사용자 입력 평단(네이티브)을 그대로 사용.
      const nativePrice = s.avgPrice;
      let priceKrw = nativePrice;
      let rateUsed = 1;
      if (ccy !== "KRW") {
        const rate = fx[ccy];
        if (!rate)
          return { ok: false, error: `환율(${ccy}/KRW)을 불러올 수 없습니다.` };
        rateUsed = rate;
        priceKrw = nativePrice * rate;
      }
      stockFx[s.symbol] = rateUsed;
      converted.push({
        ...s,
        avgPrice: priceKrw,
        buyDate: s.buyDate,
      });
    }
    stocks = converted;
  }

  // 설립자본(t0 시드) = 현금만. 보유종목 자본은 각 "매수일"에 증자(DEPOSIT)로 투입한다.
  // → 매수가 여러 해에 흩어져도 그 시점부터 자본이 굴러간 것으로 XIRR이 정확해짐.
  //   (인앱 매수의 적립식 증자 모델과 동일. 평가액·누적수익률은 종전과 동일, XIRR 시점만 정밀화.)
  const initialValuation = input.cash || 0;

  // 설립일(t0)은 가장 이른 매수일 이전이어야 흐름이 음수 시점에 안 생긴다.
  const buyDates = stocks
    .map((s) => s.buyDate)
    .filter((d): d is string => !!d);
  const companyFoundedAt = buyDates.reduce(
    (min, d) => (d < min ? d : min),
    foundedAt,
  );

  const { data: holding, error: hErr } = await supabase
    .from("holdings")
    .insert({
      name: input.name.trim(),
      mode: "ledger",
      founded_at: companyFoundedAt,
      initial_capital: initialValuation,
      initial_valuation: initialValuation,
    })
    .select("id")
    .single();
  if (hErr || !holding) return { ok: false, error: hErr?.message ?? "설립 실패" };

  // 트리거가 기본 계좌를 자동 생성한다. 조회 후 사용자가 정한 이름·유형으로 갱신.
  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("holding_id", holding.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (!account) return { ok: false, error: "기본 계좌 생성 확인 실패" };

  const accountDrafts: FoundingAccount[] = input.accounts?.length
    ? input.accounts.map((draft, index) => ({
        name: draft.name.trim() || (index === 0 ? "기본 계좌" : `계좌 ${index + 1}`),
        accountType: draft.accountType,
      }))
    : [
        {
          name: input.accountName?.trim() || "기본 계좌",
          accountType: input.accountType ?? "GENERAL",
        },
      ];

  const { error: accountUpdateError } = await supabase
    .from("accounts")
    .update({
      name: accountDrafts[0].name,
      account_type: accountDrafts[0].accountType,
    })
    .eq("id", account.id);
  if (accountUpdateError)
    return { ok: false, error: accountUpdateError.message };

  const accountIds = [account.id];
  if (accountDrafts.length > 1) {
    const { data: addedAccounts, error: addedAccountsError } = await supabase
      .from("accounts")
      .insert(
        accountDrafts.slice(1).map((draft) => ({
          holding_id: holding.id,
          name: draft.name,
          account_type: draft.accountType,
        })),
      )
      .select("id");
    if (addedAccountsError)
      return { ok: false, error: addedAccountsError.message };
    accountIds.push(...(addedAccounts ?? []).map((row) => row.id));
  }

  if (stocks.length) {
    // 보유종목마다 (그 매수일에) 증자 + 매수를 짝지어 기록한다.
    //  · DEPOSIT(+매입원가): 그 시점에 자본이 투입됨 → XIRR 흐름의 자본 투입일.
    //  · BUY(매입원가 차감): 통화 풀에서 매입대금 차감(증자와 상쇄 → 순현금 0).
    // 증자는 종목 통화·환율을 그대로 따라가야 통화별 현금 풀이 정확히 상쇄된다.
    const rows = stocks.flatMap((x) => {
      const ccy = stockCurrencies[x.symbol] ?? "KRW";
      const fx = stockFx[x.symbol] ?? 1;
      const eventDate = x.buyDate ?? foundedAt;
      const cost = x.quantity * x.avgPrice; // ₩ 매입원가
      const accountId = accountIds[x.accountIndex ?? 0] ?? accountIds[0];
      return [
        {
          account_id: accountId,
          type: "DEPOSIT" as const,
          symbol: null,
          quantity: null,
          price_or_amount: cost,
          fee_and_tax: 0,
          date: eventDate,
          currency: ccy,
          fx_rate: fx,
          source: "snapshot" as const, // 온보딩 현재보유 스냅샷 — 실제 매매로 교체될 임시 기록
        },
        {
          account_id: accountId,
          type: "BUY" as const,
          symbol: x.symbol,
          quantity: x.quantity,
          price_or_amount: x.avgPrice, // 이미 ₩ 환산됨
          fee_and_tax: 0,
          date: eventDate,
          currency: ccy,
          fx_rate: fx,
          source: "snapshot" as const, // 온보딩 현재보유 스냅샷 — 실제 매매로 교체될 임시 기록
        },
      ];
    });
    const { error: eErr } = await supabase.from("events").insert(rows);
    if (eErr) return { ok: false, error: eErr.message };

    // 종목명·통화·유형 보관(화면에서 코드 대신 이름 표시 + 자산배분 태그)
    await upsertSecurities(
      supabase,
      stocks.map((s) => ({
        symbol: s.symbol,
        name: s.name,
        currency: stockCurrencies[s.symbol] ?? "KRW",
        instrumentType: stockTypes[s.symbol] ?? "EQUITY",
      })),
    );
  }

  const { data: createdAccountRows, error: createdAccountsError } = await supabase
    .from("accounts")
    .select("id, name, account_type, commission_rate")
    .eq("holding_id", holding.id)
    .order("created_at", { ascending: true });
  if (createdAccountsError)
    return { ok: false, error: createdAccountsError.message };

  await setActiveHoldingCookie(holding.id);

  return {
    ok: true,
    holdingId: holding.id,
    accounts: (createdAccountRows ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      accountType: row.account_type,
      commissionRate: Number(row.commission_rate),
    })),
  };
}

export interface BuyInput {
  symbol: string;
  name: string;
  quantity: number;
  price: number;
  date: string;
}

/** J4 — 첫 인수(매수). 자금 부족 시 v0에선 설립자본 자동 투입(여정 차단 방지). */
export async function recordFirstBuy(input: BuyInput): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const holding = await getActiveHolding(supabase);
  if (!holding) return { ok: false, error: "회사를 찾을 수 없습니다." };

  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("holding_id", holding.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (!account) return { ok: false, error: "계좌를 찾을 수 없습니다." };

  // 거래일: challenge → 오늘 고정(소급 불가), ledger → 입력값
  const date = holding.mode === "challenge" ? todayKST() : input.date;

  // 가격: challenge → 현재 시세로 강제(클라이언트 입력 무시, 조작 차단).
  //       ledger → 사용자가 입력한 실제 매입가.
  // 외국 종목은 현재 환율로 ₩ 환산해 기록(기능통화=KRW).
  let price = input.price;
  let currency = "KRW";
  let fxRate = 1; // 1 네이티브당 ₩(KRW=1)
  let instrumentType = "EQUITY";
  {
    const { prices, currencies, instrumentTypes, available } = await getPrices([
      input.symbol,
    ]);
    currency = currencies[input.symbol] ?? "KRW";
    instrumentType = instrumentTypes[input.symbol] ?? "EQUITY";
    // 통화 안전장치: 해외(6자리 숫자 아님) 종목이 "KRW"면 통화 감지 실패 → 외화가를 ₩로 오기록 방지.
    if (currency === "KRW" && !/^\d{6}$/.test(input.symbol)) {
      return {
        ok: false,
        error: "종목 통화를 확인하지 못했습니다. 잠시 후 다시 시도하세요.",
      };
    }
    if (holding.mode === "challenge") {
      const mp = prices[input.symbol];
      if (!available || mp == null)
        return { ok: false, error: "시세를 불러올 수 없어 매수할 수 없습니다." };
      price = mp;
    }
    if (currency !== "KRW") {
      const fx = await getFxToKrw([currency]);
      const rate = fx[currency];
      if (!rate)
        return {
          ok: false,
          error: `환율(${currency}/KRW)을 불러올 수 없어 매수할 수 없습니다.`,
        };
      fxRate = rate;
      price = price * rate;
    }
  }
  if (!(price > 0)) return { ok: false, error: "가격이 올바르지 않습니다." };
  const cost = input.quantity * price;

  // 가용현금 = 설립자본 + 기존 현금흐름잔고
  const { data: existing } = await supabase
    .from("events")
    .select("type, quantity, price_or_amount, fee_and_tax")
    .eq("account_id", account.id);
  const mapped: InvestmentEvent[] = (existing ?? []).map((e) => ({
    type: e.type,
    quantity: e.quantity === null ? null : Number(e.quantity),
    priceOrAmount: Number(e.price_or_amount),
    feeAndTax: Number(e.fee_and_tax),
    date: "1970-01-01",
  }));
  const availableCash = Number(holding.initial_valuation) + cashBalance(mapped);

  if (availableCash < cost) {
    const bumped = Number(holding.initial_valuation) + (cost - availableCash);
    await supabase
      .from("holdings")
      .update({ initial_valuation: bumped, initial_capital: bumped })
      .eq("id", holding.id);
  }

  const { error } = await supabase.from("events").insert({
    account_id: account.id,
    type: "BUY",
    symbol: input.symbol,
    quantity: input.quantity,
    price_or_amount: price,
    fee_and_tax: 0,
    date,
    currency,
    fx_rate: fxRate,
  });
  if (error) return { ok: false, error: error.message };

  // 종목명·통화·유형 보관
  await upsertSecurities(supabase, [
    { symbol: input.symbol, name: input.name, currency, instrumentType },
  ]);

  return { ok: true, holdingId: holding.id };
}
