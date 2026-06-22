"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  companyCashPools,
  netQuantities,
  type InvestmentEvent,
  type EventType,
} from "@/lib/finance/valuation";
import { estimateFeeAndTax } from "@/lib/finance/fees";
import { getPrices } from "@/lib/finance/prices";
import { getFxToKrw } from "@/lib/finance/fx";
import { upsertSecurities } from "@/lib/securities";
import { activeEventRows } from "@/lib/portfolio";
import { todayKST } from "@/lib/date";
import type { AccountType } from "@/lib/config/tax";
import type { Database } from "@/lib/supabase/database.types";
import { getActiveHolding } from "@/lib/holdings";

type Result = { ok: true; note?: string } | { ok: false; error: string };
type EventRow = Database["public"]["Tables"]["events"]["Row"];

interface AccountInfo {
  id: string;
  commissionRate: number;
  accountType: AccountType;
}

interface Ctx {
  supabase: Awaited<ReturnType<typeof createClient>>;
  holding: {
    id: string;
    mode: "ledger" | "challenge" | "live";
    initialValuation: number;
    foundedAt: string;
    foundingDeclared: boolean;
  };
  /** 이 holding 의 모든 계좌. */
  accounts: AccountInfo[];
  /** 기본(설립) 계좌 = 가장 먼저 만들어진 계좌. 설립자본이 여기 귀속. */
  mainAccountId: string;
  /** 모든 계좌의 이벤트(계좌별 필터는 헬퍼로). */
  rows: EventRow[];
}

async function loadCtx(): Promise<Ctx | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const holding = await getActiveHolding(supabase);
  if (!holding) return { error: "회사를 찾을 수 없습니다." };

  const { data: accountRows } = await supabase
    .from("accounts")
    .select("id, commission_rate, account_type")
    .eq("holding_id", holding.id)
    .order("created_at", { ascending: true });
  if (!accountRows || accountRows.length === 0)
    return { error: "계좌를 찾을 수 없습니다." };

  const accounts: AccountInfo[] = accountRows.map((a) => ({
    id: a.id,
    commissionRate: Number(a.commission_rate),
    accountType: a.account_type,
  }));
  const accountIds = accounts.map((a) => a.id);

  const { data: rows } = await supabase
    .from("events")
    .select("*")
    .in("account_id", accountIds);

  return {
    supabase,
    holding: {
      id: holding.id,
      mode: holding.mode,
      initialValuation: Number(holding.initial_valuation),
      foundedAt: holding.founded_at,
      foundingDeclared:
        (holding as { founding_declared?: boolean }).founding_declared ?? false,
    },
    accounts,
    mainAccountId: accounts[0].id,
    rows: rows ?? [],
  };
}

function mapRow(r: EventRow): InvestmentEvent {
  return {
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
  };
}

/** 특정 계좌의 활성 이벤트(삭제·상쇄 제외)를 계산용 형태로. */
function activeMapped(ctx: Ctx, accountId: string): InvestmentEvent[] {
  return activeEventRows(ctx.rows.filter((r) => r.account_id === accountId)).map(
    mapRow,
  );
}

/**
 * 회사 통화별 현금 풀(계좌 밖, 회사 레벨) = 설립자본(₩) + 모든 계좌 현금흐름.
 * 현금은 계좌가 아니라 지주회사 금고에 있다 — 매수는 종목 통화 풀에서 차감.
 * 반환은 네이티브 단위(KRW 풀에 설립자본 시드).
 */
function cashPoolsOf(ctx: Ctx): Record<string, number> {
  return companyCashPools(
    activeEventRows(ctx.rows).map(mapRow),
    ctx.holding.initialValuation,
  );
}

export interface RecordInput {
  type: EventType;
  symbol?: string | null;
  /** 종목명(검색 결과). BUY 시 securities 에 적재해 화면에서 이름 표시. */
  name?: string | null;
  quantity?: number | null;
  /** BUY/SELL=단가, DIVIDEND/DEPOSIT/WITHDRAWAL=금액 */
  priceOrAmount: number;
  /** 비우면(null) 자동 추정. */
  feeAndTax?: number | null;
  date: string;
  /** 거래가 귀속될 계좌. 비우면 기본(설립) 계좌. */
  accountId?: string | null;
  /**
   * 매수 자금 출처:
   *  - "cash": 계좌에 있던 현금으로(부족하면 거부, 증자 안 만듦)
   *  - "deposit"(기본): 부족분 자동 증자(월급 등 새 자금)
   */
  fundingSource?: "cash" | "deposit";
  /**
   * 증자/인출 통화(네이티브). 기본 KRW. KRW 외면 priceOrAmount 는 이 통화의
   * 네이티브 금액 → 서버가 현재 환율로 ₩ 환산 저장.
   */
  currency?: string;
  /** 환전(EXCHANGE) 받는 통화. type==="EXCHANGE" 일 때 필수. */
  toCurrency?: string;
}

/**
 * 장부 모드에서 거래일이 설립일보다 이르면 설립일을 그 날짜로 당긴다(뒤로만).
 * 설립 확정(founding_declared) 상태였다면 자동 해제(더 과거 거래 발견).
 * 반환: 설립 확정이 해제됐으면 안내 note, 아니면 null.
 */
async function backdateFoundingIfEarlier(
  ctx: Ctx,
  date: string,
): Promise<string | null> {
  if (ctx.holding.mode !== "ledger") return null;
  if (!(date < ctx.holding.foundedAt)) return null;
  const unsealed = ctx.holding.foundingDeclared;
  await ctx.supabase
    .from("holdings")
    .update({
      founded_at: date,
      ...(unsealed ? { founding_declared: false } : {}),
    })
    .eq("id", ctx.holding.id);
  return unsealed
    ? "더 과거 거래가 추가돼 설립 확정이 해제됐어요(설립일 갱신)."
    : null;
}

/** 5종 이벤트 기록 — 모드 규칙·검증·수수료 추정. 계좌 단위로 검증. */
export async function recordEvent(input: RecordInput): Promise<Result> {
  const ctx = await loadCtx();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { supabase, holding } = ctx;

  // 대상 계좌 결정(검증·기록 단위)
  const accountId = input.accountId ?? ctx.mainAccountId;
  const account = ctx.accounts.find((a) => a.id === accountId);
  if (!account) return { ok: false, error: "계좌를 찾을 수 없습니다." };

  const today = todayKST();
  // 거래일: challenge/live → 오늘 고정(소급 불가), ledger → 입력값
  const date = holding.mode === "ledger" ? input.date : today;
  if (date > today) return { ok: false, error: "미래 날짜는 기록할 수 없습니다." };

  // ── 환전(EXCHANGE): 통화 간 현금 이동(₩ 장부에는 중립, 통화 풀만 이동) ──
  if (input.type === "EXCHANGE") {
    const fromCcy = input.currency ?? "KRW";
    const toCcy = input.toCurrency ?? "";
    const fromAmount = input.priceOrAmount; // 네이티브(보내는 통화)
    if (!toCcy || toCcy === fromCcy)
      return { ok: false, error: "바꿀 통화를 다르게 선택하세요." };
    if (!(fromAmount > 0))
      return { ok: false, error: "환전 금액을 입력하세요." };

    const fx = await getFxToKrw([fromCcy, toCcy]);
    const fromFx = fx[fromCcy];
    const toFx = fx[toCcy];
    if (!fromFx || !toFx)
      return { ok: false, error: "환율을 불러올 수 없어 환전할 수 없습니다." };

    // 보내는 통화 풀 잔액 확인
    const pools = cashPoolsOf(ctx);
    const have = pools[fromCcy] ?? 0;
    if (fromAmount > have)
      return {
        ok: false,
        error: `${fromCcy} 현금이 부족합니다(보유 ${have.toLocaleString()}).`,
      };

    const krwValue = fromAmount * fromFx; // ₩ 가치(진입 기준)
    const toAmount = krwValue / toFx; // 받는 네이티브 금액

    const { error: xErr } = await supabase.from("events").insert({
      account_id: accountId,
      type: "EXCHANGE",
      symbol: null,
      quantity: null,
      price_or_amount: krwValue, // from 측 ₩ 가치(₩ 장부 중립이지만 history용)
      fee_and_tax: 0,
      date,
      currency: fromCcy,
      fx_rate: fromFx,
      to_currency: toCcy,
      to_amount: toAmount,
    });
    if (xErr) return { ok: false, error: xErr.message };

    revalidatePath("/dashboard");
    revalidatePath("/activity");
    // 적용 환율 표기: 외화를 ₩ 기준으로(1 외화 = ₩X). 둘 다 외화면 교차환율.
    const foreign = fromCcy !== "KRW" ? fromCcy : toCcy;
    const rate =
      fromCcy !== "KRW" ? fromFx : toCcy !== "KRW" ? toFx : null;
    const rateNote =
      rate != null
        ? ` (1 ${foreign} = ₩${rate.toLocaleString(undefined, { maximumFractionDigits: 2 })})`
        : "";
    return {
      ok: true,
      note: `${fromCcy} ${fromAmount.toLocaleString()} → ${toCcy} ${toAmount.toLocaleString(
        undefined,
        { maximumFractionDigits: 2 },
      )}${rateNote}`,
    };
  }

  const needsSymbol =
    input.type === "BUY" || input.type === "SELL" || input.type === "DIVIDEND";
  const needsQty = input.type === "BUY" || input.type === "SELL";

  if (needsSymbol && !input.symbol)
    return { ok: false, error: "종목을 선택하세요." };
  if (needsQty && !(Number(input.quantity) > 0))
    return { ok: false, error: "수량을 입력하세요." };

  // 가격·통화: challenge/live 매수·매도는 현재 시세(네이티브)로 강제. 외국 종목은 현재 환율로 ₩ 환산.
  //   기능통화 = KRW → 외국 주식/배당은 ₩로 환산해 장부 기록(현금도 ₩ 단일).
  let priceOrAmount = input.priceOrAmount;
  let currency = "KRW";
  let fxRate = 1; // 1 네이티브당 ₩(KRW=1). 통화 풀 계산용으로 함께 저장.
  let instrumentType = "EQUITY";
  if (needsSymbol && input.symbol) {
    const { prices, currencies, instrumentTypes, available } = await getPrices([
      input.symbol,
    ]);
    currency = currencies[input.symbol] ?? "KRW";
    instrumentType = instrumentTypes[input.symbol] ?? "EQUITY";

    // 통화 안전장치: 6자리 숫자=한국(KRW). 그 외(해외) 종목이 "KRW"로 잡히면
    // 통화 감지 실패 → ₩ 환산 없이 외화 가격을 그대로 저장하는 사고 방지(조용히 대체 금지).
    if (currency === "KRW" && !/^\d{6}$/.test(input.symbol)) {
      return {
        ok: false,
        error: "종목 통화를 확인하지 못했습니다. 잠시 후 다시 시도하세요.",
      };
    }

    if (needsQty && holding.mode !== "ledger") {
      const mp = prices[input.symbol];
      if (!available || mp == null)
        return { ok: false, error: "시세를 불러올 수 없어 기록할 수 없습니다." };
      priceOrAmount = mp; // 네이티브 시세
    }

    if (currency !== "KRW") {
      const fx = await getFxToKrw([currency]);
      const rate = fx[currency];
      if (!rate)
        return {
          ok: false,
          error: `환율(${currency}/KRW)을 불러올 수 없어 기록할 수 없습니다.`,
        };
      fxRate = rate;
      priceOrAmount = priceOrAmount * rate; // ₩ 환산(주당)
    }
  } else if (input.type === "DEPOSIT" || input.type === "WITHDRAWAL") {
    // 외화 증자/인출: priceOrAmount 는 네이티브 금액 → 현재 환율로 ₩ 환산 저장.
    currency = input.currency ?? "KRW";
    if (currency !== "KRW") {
      const fx = await getFxToKrw([currency]);
      const rate = fx[currency];
      if (!rate)
        return {
          ok: false,
          error: `환율(${currency}/KRW)을 불러올 수 없어 기록할 수 없습니다.`,
        };
      fxRate = rate;
      priceOrAmount = priceOrAmount * rate; // ₩ 환산
    }
  }
  if (!(priceOrAmount > 0))
    return { ok: false, error: "금액이 올바르지 않습니다." };

  // 매각은 (이 계좌의) 보유 수량을 초과할 수 없다(음수 포지션 방지).
  if (input.type === "SELL") {
    const held =
      netQuantities(activeMapped(ctx, accountId))[input.symbol as string] ?? 0;
    if (Number(input.quantity) > held)
      return {
        ok: false,
        error: `이 계좌의 보유 수량(${held}주)보다 많이 매도할 수 없습니다.`,
      };
  }

  const gross = needsQty ? Number(input.quantity) * priceOrAmount : priceOrAmount;

  // 수수료·세금: 입력 없으면 자동 추정
  const feeAndTax =
    input.feeAndTax != null && input.feeAndTax >= 0
      ? input.feeAndTax
      : estimateFeeAndTax(
          input.type,
          gross,
          account.commissionRate,
          account.accountType,
        );

  // 출금이 해당 통화 풀을 초과 시 거부(현금은 통화별로 보유).
  if (input.type === "WITHDRAWAL") {
    const pools = cashPoolsOf(ctx);
    const have = pools[currency] ?? 0;
    const outNative = (priceOrAmount + feeAndTax) / fxRate;
    if (outNative > have)
      return {
        ok: false,
        error: `${currency} 현금(${have.toLocaleString()})을 초과해 인출할 수 없습니다.`,
      };
  }

  // 매수 자금 출처:
  //  · "cash"(있던 현금으로): 종목 통화 풀에서만. 부족하면 거부(증자 안 함).
  //  · "deposit"(새 돈으로): 매수액 전체를 새로 증자 → 기존 현금은 그대로 유지(버퍼·현금비중 안정).
  //    적립식(월급) 모델: 이번 매수는 새 자금으로, 투입 원금만 증가.
  let autoDepositKrw = 0;
  if (input.type === "BUY") {
    const pools = cashPoolsOf(ctx);
    const have = pools[currency] ?? 0; // 네이티브
    const costNative = (gross + feeAndTax) / fxRate;
    if (input.fundingSource === "cash") {
      if (costNative > have)
        return {
          ok: false,
          error:
            currency === "KRW"
              ? `회사 현금이 부족합니다(₩${Math.round(have).toLocaleString()}). '새 돈으로(증자)'를 고르거나 증자를 먼저 기록하세요.`
              : `${currency} 현금이 부족합니다(${have.toLocaleString()}). '새 돈으로(증자)'를 고르거나, ₩를 ${currency}로 환전하세요.`,
        };
    } else {
      // 매수 비용 전체를 증자(기존 현금 미사용). 통화는 종목 통화.
      const depositNative =
        currency === "KRW"
          ? Math.ceil(costNative)
          : Math.ceil(costNative * 100) / 100;
      const depositKrw = depositNative * fxRate;
      autoDepositKrw = depositKrw;
      const { error: dErr } = await supabase.from("events").insert({
        account_id: accountId,
        type: "DEPOSIT",
        symbol: null,
        quantity: null,
        price_or_amount: depositKrw,
        fee_and_tax: 0,
        date,
        currency,
        fx_rate: fxRate,
      });
      if (dErr) return { ok: false, error: dErr.message };
    }
  }

  const { error } = await supabase.from("events").insert({
    account_id: accountId,
    type: input.type,
    symbol: needsSymbol ? input.symbol : null,
    quantity: needsQty ? Number(input.quantity) : null,
    price_or_amount: priceOrAmount,
    fee_and_tax: feeAndTax,
    date,
    currency,
    fx_rate: fxRate,
  });
  if (error) return { ok: false, error: error.message };

  // 매수 종목명·통화 보관(검색으로 산 임의 종목도 화면에 이름·통화 표시)
  if (input.type === "BUY" && input.symbol && input.name) {
    await upsertSecurities(supabase, [
      { symbol: input.symbol, name: input.name, currency, instrumentType },
    ]);
  }

  const backdateNote = await backdateFoundingIfEarlier(ctx, date);

  revalidatePath("/dashboard");
  revalidatePath("/activity");
  revalidatePath("/import");
  const notes = [
    autoDepositKrw > 0
      ? `₩${Math.round(autoDepositKrw).toLocaleString()} 증자(투입 원금 반영, 기존 현금 유지)`
      : null,
    backdateNote,
  ].filter(Boolean) as string[];
  return notes.length ? { ok: true, note: notes.join(" · ") } : { ok: true };
}

export interface BuyItemInput {
  symbol: string;
  name: string;
  quantity: number;
  /** 장부 모드 매입 단가(네이티브). 챌린지/라이브는 서버가 시세로 강제(무시). */
  price: number;
}

/**
 * 다자산 매수(여러 종목 한 번에) — 단건 BUY 로직을 배치로.
 * 검증을 전부 선행한 뒤 DEPOSIT(필요 시)+BUY 행을 **한 번의 insert**로 → 원자적(설립 등기와 동일 모델).
 * 통화는 종목별로 결정·환산(혼합 카트 지원). 자금 출처는 배치 전체에 1개 적용.
 */
export async function recordBuys(input: {
  items: BuyItemInput[];
  accountId?: string | null;
  date: string;
  fundingSource: "cash" | "deposit";
}): Promise<Result> {
  const ctx = await loadCtx();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { supabase, holding } = ctx;

  const items = input.items.filter((i) => i.symbol && Number(i.quantity) > 0);
  if (items.length === 0) return { ok: false, error: "담은 종목이 없습니다." };

  const accountId = input.accountId ?? ctx.mainAccountId;
  const account = ctx.accounts.find((a) => a.id === accountId);
  if (!account) return { ok: false, error: "계좌를 찾을 수 없습니다." };

  const today = todayKST();
  const date = holding.mode === "ledger" ? input.date : today;
  if (date > today) return { ok: false, error: "미래 날짜는 기록할 수 없습니다." };

  // ── 배치 시세 1회 + 종목별 통화 결정(안전장치: 6자리 아닌데 KRW면 감지 실패 → 거부) ──
  const symbols = [...new Set(items.map((i) => i.symbol))];
  const { prices, currencies, instrumentTypes, available } =
    await getPrices(symbols);
  const ccyOf: Record<string, string> = {};
  for (const s of symbols) {
    const ccy = currencies[s] ?? "KRW";
    if (ccy === "KRW" && !/^\d{6}$/.test(s))
      return {
        ok: false,
        error: `종목 통화를 확인하지 못했습니다(${s}). 잠시 후 다시 시도하세요.`,
      };
    ccyOf[s] = ccy;
  }

  // ── 환율(비-KRW) 1회 ──
  const foreignCcys = [
    ...new Set(Object.values(ccyOf).filter((c) => c !== "KRW")),
  ];
  const fx = foreignCcys.length ? await getFxToKrw(foreignCcys) : {};
  for (const c of foreignCcys)
    if (!fx[c])
      return {
        ok: false,
        error: `환율(${c}/KRW)을 불러올 수 없어 매수할 수 없습니다.`,
      };

  // ── 종목별 ₩단가·비용·수수료 산출(challenge=시세 강제, ledger=입력가) ──
  interface Prepared {
    item: BuyItemInput;
    ccy: string;
    fxRate: number;
    priceKrw: number;
    fee: number;
    costNative: number;
  }
  const prepared: Prepared[] = [];
  for (const item of items) {
    const ccy = ccyOf[item.symbol];
    const fxRate = ccy === "KRW" ? 1 : fx[ccy];
    let nativePrice = item.price;
    if (holding.mode !== "ledger") {
      const mp = prices[item.symbol];
      if (!available || mp == null)
        return {
          ok: false,
          error: `${item.name} 시세를 불러올 수 없어 매수할 수 없습니다.`,
        };
      nativePrice = mp;
    }
    if (!(nativePrice > 0))
      return { ok: false, error: `${item.name} 가격이 올바르지 않습니다.` };
    const priceKrw = nativePrice * fxRate;
    const gross = Number(item.quantity) * priceKrw;
    const fee = estimateFeeAndTax(
      "BUY",
      gross,
      account.commissionRate,
      account.accountType,
    );
    prepared.push({
      item,
      ccy,
      fxRate,
      priceKrw,
      fee,
      costNative: (gross + fee) / fxRate,
    });
  }

  // ── 자금 출처 ──
  const rows: Database["public"]["Tables"]["events"]["Insert"][] = [];
  let depositKrwTotal = 0;
  if (input.fundingSource === "cash") {
    // 통화별 총비용 vs 풀(혼합 카트는 통화별로 각각 검사). 부족하면 거부(증자 안 함).
    const pools = cashPoolsOf(ctx);
    const needByCcy: Record<string, number> = {};
    for (const p of prepared)
      needByCcy[p.ccy] = (needByCcy[p.ccy] ?? 0) + p.costNative;
    for (const [ccy, need] of Object.entries(needByCcy)) {
      const have = pools[ccy] ?? 0;
      if (need > have)
        return {
          ok: false,
          error:
            ccy === "KRW"
              ? `회사 현금이 부족합니다(₩${Math.round(have).toLocaleString()} < 필요 ₩${Math.round(need).toLocaleString()}). '새 돈으로(증자)'를 고르거나 증자를 먼저 기록하세요.`
              : `${ccy} 현금이 부족합니다(${have.toLocaleString()} < 필요 ${need.toLocaleString()}). '새 돈으로(증자)'를 고르거나 ₩를 ${ccy}로 환전하세요.`,
        };
    }
  } else {
    // 새 돈으로: 종목별 비용만큼 증자(통화 일치). 기존 현금 유지·투입원금만 ↑.
    for (const p of prepared) {
      const depositNative =
        p.ccy === "KRW"
          ? Math.ceil(p.costNative)
          : Math.ceil(p.costNative * 100) / 100;
      const depositKrw = depositNative * p.fxRate;
      depositKrwTotal += depositKrw;
      rows.push({
        account_id: accountId,
        type: "DEPOSIT",
        symbol: null,
        quantity: null,
        price_or_amount: depositKrw,
        fee_and_tax: 0,
        date,
        currency: p.ccy,
        fx_rate: p.fxRate,
      });
    }
  }

  // ── BUY 행 ──
  for (const p of prepared) {
    rows.push({
      account_id: accountId,
      type: "BUY",
      symbol: p.item.symbol,
      quantity: Number(p.item.quantity),
      price_or_amount: p.priceKrw,
      fee_and_tax: p.fee,
      date,
      currency: p.ccy,
      fx_rate: p.fxRate,
    });
  }

  const { error } = await supabase.from("events").insert(rows);
  if (error) return { ok: false, error: error.message };

  // 종목명·통화·유형 일괄 적재(검색으로 산 임의 종목도 이름 표시)
  await upsertSecurities(
    supabase,
    prepared.map((p) => ({
      symbol: p.item.symbol,
      name: p.item.name,
      currency: p.ccy,
      instrumentType: instrumentTypes[p.item.symbol] ?? "EQUITY",
    })),
  );

  const backdateNote = await backdateFoundingIfEarlier(ctx, date);

  revalidatePath("/dashboard");
  revalidatePath("/activity");
  revalidatePath("/import");
  const base =
    depositKrwTotal > 0
      ? `₩${Math.round(depositKrwTotal).toLocaleString()} 증자됨 · 회사 연혁에 기록됨`
      : "회사 연혁에 기록됨";
  return { ok: true, note: backdateNote ? `${base} · ${backdateNote}` : base };
}

/**
 * 매수·매도 기록 수정(장부 전용) — 수량·단가(네이티브)·날짜.
 * 통화·환율은 원본 유지(과거 환율 보존), ₩단가·수수료는 재계산.
 * 매수에 짝지어 생성된 증자(DEPOSIT)는 건드리지 않음(삭제와 동일한 동작).
 */
export async function updateTradeEvent(input: {
  id: string;
  quantity: number;
  priceNative: number;
  date: string;
}): Promise<Result> {
  const ctx = await loadCtx();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { supabase, holding, rows } = ctx;

  if (holding.mode !== "ledger")
    return { ok: false, error: "장부 모드에서만 수정할 수 있습니다." };

  const ev = rows.find((r) => r.id === input.id);
  if (!ev) return { ok: false, error: "거래를 찾을 수 없습니다." };
  if (ev.deleted_at) return { ok: false, error: "삭제된 거래입니다." };
  if (ev.type !== "BUY" && ev.type !== "SELL")
    return { ok: false, error: "매수·매도만 수정할 수 있습니다." };

  const today = todayKST();
  if (input.date > today)
    return { ok: false, error: "미래 날짜는 기록할 수 없습니다." };
  if (!(input.quantity > 0)) return { ok: false, error: "수량을 입력하세요." };
  if (!(input.priceNative > 0)) return { ok: false, error: "가격을 입력하세요." };

  const account = ctx.accounts.find((a) => a.id === ev.account_id);
  if (!account) return { ok: false, error: "계좌를 찾을 수 없습니다." };

  const fx = ev.fx_rate == null || Number(ev.fx_rate) <= 0 ? 1 : Number(ev.fx_rate);
  const priceKrw = input.priceNative * fx;
  const gross = input.quantity * priceKrw;

  // 매도는 (이 거래 제외) 보유 수량을 초과할 수 없음
  if (ev.type === "SELL") {
    const others = activeEventRows(
      rows.filter((r) => r.account_id === ev.account_id && r.id !== ev.id),
    ).map(mapRow);
    const held = netQuantities(others)[ev.symbol as string] ?? 0;
    if (input.quantity > held)
      return {
        ok: false,
        error: `이 계좌의 보유 수량(${held}주)보다 많이 매도할 수 없습니다.`,
      };
  }

  const feeAndTax = estimateFeeAndTax(
    ev.type,
    gross,
    account.commissionRate,
    account.accountType,
  );

  const { error } = await supabase
    .from("events")
    .update({
      quantity: input.quantity,
      price_or_amount: priceKrw,
      fee_and_tax: feeAndTax,
      date: input.date,
    })
    .eq("id", ev.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/activity");
  revalidatePath("/import");
  return { ok: true };
}

/** 이벤트 소프트 삭제 — 장부 자유, 챌린지/라이브는 당일만. */
export async function deleteEvent(id: string): Promise<Result> {
  const ctx = await loadCtx();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { supabase, holding, rows } = ctx;

  const ev = rows.find((r) => r.id === id);
  if (!ev) return { ok: false, error: "이벤트를 찾을 수 없습니다." };

  if (holding.mode !== "ledger" && ev.date !== todayKST())
    return {
      ok: false,
      error: "지난 거래는 삭제할 수 없습니다. 오늘 날짜 상쇄(취소)만 가능합니다.",
    };

  const { error } = await supabase
    .from("events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/activity");
  revalidatePath("/import");
  return { ok: true };
}

/** 과거 이벤트 상쇄(챌린지/라이브) — 원본 보존, 오늘 날짜 취소 이벤트 추가. */
export async function reverseEvent(id: string): Promise<Result> {
  const ctx = await loadCtx();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { supabase, rows } = ctx;

  const ev = rows.find((r) => r.id === id);
  if (!ev) return { ok: false, error: "이벤트를 찾을 수 없습니다." };
  if (ev.reverses_event_id)
    return { ok: false, error: "상쇄 이벤트는 다시 상쇄할 수 없습니다." };
  if (rows.some((r) => r.reverses_event_id === id && !r.deleted_at))
    return { ok: false, error: "이미 상쇄된 거래입니다." };

  // 상쇄 이벤트는 원본과 같은 계좌에 기록(통화·환전 필드까지 복제 → 제약 충족).
  const { error } = await supabase.from("events").insert({
    account_id: ev.account_id,
    type: ev.type,
    symbol: ev.symbol,
    quantity: ev.quantity,
    price_or_amount: ev.price_or_amount,
    fee_and_tax: ev.fee_and_tax,
    date: todayKST(),
    reverses_event_id: id,
    currency: ev.currency,
    fx_rate: ev.fx_rate,
    to_currency: ev.to_currency,
    to_amount: ev.to_amount,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/activity");
  return { ok: true };
}
