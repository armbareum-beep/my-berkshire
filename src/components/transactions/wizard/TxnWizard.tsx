"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordEvent } from "@/app/transactions/actions";
import { estimateFeeAndTax } from "@/lib/finance/fees";
import { useMarketPrice } from "@/lib/finance/useMarketPrice";
import { isCrypto } from "@/lib/securities";
import { findCatalogItem, type CatalogItem } from "@/lib/finance/catalog";
import { currencyMeta, nativeMoney } from "@/lib/finance/currencies";
import { won } from "@/lib/format";
import { WON_STEPS, QTY_STEPS, wonStepLabel, priceStepsFor } from "@/components/ui/QuickAdd";
import { NumberPadField } from "@/components/ui/NumberPad";
import { Avatar } from "@/components/ui/Avatar";
import { SymbolPicker } from "@/components/onboarding/SymbolPicker";
import { StepShell } from "./StepShell";
import { SuccessOverlay } from "./SuccessOverlay";
import { AmountBody, CurrencyChips } from "./steps";
import { AccountPicker } from "./AccountPicker";
import type { TypeCfg } from "@/components/transactions/eventTypes";
import type { AccountOption } from "@/components/transactions/TransactionFlow";

/** 통화별 금액 빠른더하기(₩=만 단위, 외화=기호+소액). TransactionFlow 와 동일. */
function amountStepsFor(ccy: string): {
  steps: number[];
  label: (n: number) => string;
} {
  if (ccy === "KRW") return { steps: WON_STEPS, label: wonStepLabel };
  const m = currencyMeta(ccy);
  return {
    steps: [10, 100, 1_000],
    label: (n) => `+${m.symbol}${n.toLocaleString()}`,
  };
}

type StepId =
  | "account"
  | "symbol"
  | "price"
  | "qty"
  | "amount"
  | "fromCcy"
  | "toCcy"
  | "date"
  | "review";

/**
 * 거래 입력 위저드(목업식) — 비-BUY 이벤트(매도·배당·증자·인출·환전)를 한 화면 한 질문으로.
 * 로직은 TransactionFlow 와 동일(서버 액션 recordEvent 페이로드 불변), 표현만 단계별.
 */
export function TxnWizard({
  cfg,
  mode,
  today,
  accounts,
  positionsByAccount,
  pools,
  fxRates,
  prices,
  names,
  initialCcy,
  initialSymbol,
  initialQty,
  returnTo,
  onExit,
}: {
  cfg: TypeCfg;
  mode: "ledger" | "challenge" | "live";
  today: string;
  accounts: AccountOption[];
  positionsByAccount: Record<string, Record<string, number>>;
  pools: Record<string, number>;
  fxRates: Record<string, number>;
  prices: Record<string, number>;
  names: Record<string, string>;
  initialCcy?: string;
  initialSymbol?: string;
  initialQty?: number;
  returnTo?: string;
  /** 첫 스텝에서 뒤로 — 허브로 복귀(또는 returnTo). */
  onExit: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [picked, setPicked] = useState<CatalogItem | null>(() =>
    initialSymbol
      ? {
          symbol: initialSymbol,
          name:
            names[initialSymbol] ??
            findCatalogItem(initialSymbol)?.name ??
            initialSymbol,
        }
      : null,
  );
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState(initialQty ? String(initialQty) : "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [fee, setFee] = useState("");
  const [feeOpen, setFeeOpen] = useState(false);
  const [cashCcy, setCashCcy] = useState(initialCcy ?? "KRW");
  const [toCcy, setToCcy] = useState(
    initialCcy && initialCcy !== "KRW" ? "KRW" : "USD",
  );
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ title: string; sub?: string } | null>(null);

  // 계좌 파생
  const account = accounts.find((a) => a.id === accountId) ?? accounts[0];
  const commissionRate = account?.commissionRate ?? 0;
  const accountType = account?.accountType ?? "GENERAL";
  const positions = positionsByAccount[accountId] ?? {};

  const isSell = cfg.key === "SELL";
  const isExchange = cfg.key === "EXCHANGE";
  const isCash = cfg.key === "DEPOSIT" || cfg.key === "WITHDRAWAL";
  const hasFee = cfg.key === "SELL" || cfg.key === "DIVIDEND";

  // 시세(챌린지/라이브 매도) — 훅은 항상 호출.
  const marketPrice = useMarketPrice(
    isSell && mode !== "ledger" && picked ? picked.symbol : null,
    prices,
  );

  // 보유 종목(매도·배당은 보유분만)
  const heldItems: CatalogItem[] = Object.entries(positions)
    .filter(([, q]) => q > 0)
    .map(([symbol]) => ({
      symbol,
      name: names[symbol] ?? findCatalogItem(symbol)?.name ?? symbol,
    }));
  const heldQty = picked ? (positions[picked.symbol] ?? 0) : 0;
  const isCryptoPick = !!picked && isCrypto(picked.symbol);
  const qtyUnit = isCryptoPick ? "개" : "주";

  // 종목 거래(매도·배당)의 단가·금액은 종목 네이티브 통화로 입력 → 서버가 그 통화로 해석해 ₩ 환산.
  // (₩로 라벨만 붙이고 USD 종목 값을 받으면 서버가 환율을 또 곱해 ~1500× 부풀려진다.)
  const stockCcy = picked && !/^\d{6}$/.test(picked.symbol) ? "USD" : "KRW";
  const stockFx = stockCcy === "KRW" ? 1 : (fxRates.USD ?? 1);
  const stockMeta = currencyMeta(stockCcy);

  const effectivePrice =
    isSell && mode !== "ledger" ? (marketPrice ?? 0) : Number(price);
  const qtyN = Number(qty);
  const amountN = Number(amount);
  // 챌린지/라이브 매도가(marketPrice)는 이미 ₩, 장부 입력가는 네이티브(×환율). 배당액은 네이티브.
  const ledgerFx = mode === "ledger" ? stockFx : 1;
  const gross = cfg.needsQty
    ? effectivePrice * ledgerFx * qtyN
    : amountN * stockFx; // ₩ 기준 — 수수료 추정·리뷰 표기에 사용
  const estFee = hasFee
    ? estimateFeeAndTax(cfg.key, gross, commissionRate, accountType)
    : 0;
  const shownFee = fee.trim() === "" ? estFee : Number(fee);
  const overSell = isSell && qtyN > heldQty;
  const withdrawShort = cfg.key === "WITHDRAWAL" && amountN > (pools[cashCcy] ?? 0);
  const priceOrAmount = cfg.needsQty ? effectivePrice : amountN;

  // FX 미리보기(증자·인출 외화 / 환전)
  const cashRate = fxRates[cashCcy];
  const cashPreview =
    isCash && cashCcy !== "KRW" && cashRate && amountN > 0
      ? { krw: amountN * cashRate, rate: cashRate }
      : null;
  const fromRate = fxRates[cashCcy];
  const toRate = fxRates[toCcy];
  const exchangePreview =
    isExchange && amountN > 0 && cashCcy !== toCcy && fromRate && toRate
      ? {
          received: (amountN * fromRate) / toRate,
          foreign: cashCcy !== "KRW" ? cashCcy : toCcy,
          rate: cashCcy !== "KRW" ? fromRate : toRate,
        }
      : null;

  const canSubmit =
    (!cfg.needsSymbol || !!picked) &&
    (!cfg.needsQty || qtyN > 0) &&
    !overSell &&
    !withdrawShort &&
    (!isExchange || (amountN > 0 && cashCcy !== toCcy)) &&
    priceOrAmount > 0;

  // ── 표시 스텝 목록(skip 규칙) — 흐름 중 불변이라 1회 계산 ──
  const [steps] = useState<StepId[]>(() => {
    const s: StepId[] = [];
    if (accounts.length > 1) s.push("account");
    if (cfg.needsSymbol && !initialSymbol) s.push("symbol");
    if (cfg.key === "EXCHANGE") {
      if (!initialCcy) s.push("fromCcy");
      s.push("toCcy");
    } else if (cfg.key === "DEPOSIT" || cfg.key === "WITHDRAWAL") {
      if (!initialCcy) s.push("fromCcy"); // 단일 통화 선택
    }
    if (cfg.key === "SELL" && mode === "ledger") s.push("price");
    if (cfg.needsQty) s.push("qty");
    else s.push("amount");
    if (mode === "ledger") s.push("date");
    s.push("review");
    return s;
  });

  const [stepIndex, setStepIndex] = useState(0);
  const stepId = steps[stepIndex];

  function go(delta: number) {
    setError(null);
    const next = stepIndex + delta;
    if (next < 0) return onExit();
    if (next >= steps.length) return;
    setStepIndex(next);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await recordEvent({
        type: cfg.key,
        symbol: cfg.needsSymbol ? (picked?.symbol ?? null) : null,
        name: cfg.needsSymbol ? (picked?.name ?? null) : null,
        quantity: cfg.needsQty ? qtyN : null,
        priceOrAmount,
        feeAndTax: fee.trim() === "" ? null : Number(fee),
        date: mode === "ledger" ? date : today,
        accountId,
        currency: isCash ? cashCcy : isExchange ? cashCcy : undefined,
        toCurrency: isExchange ? toCcy : undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone({ title: cfg.toast, sub: res.note ?? "회사 연혁에 기록됨" });
    });
  }

  if (done) {
    return (
      <SuccessOverlay
        title={done.title}
        sub={done.sub}
        onContinue={() => router.push(returnTo ?? "/dashboard")}
      />
    );
  }

  const total = steps.length;
  const nextBtn = (label: string, enabled: boolean, onClick: () => void) => (
    <button
      type="button"
      disabled={!enabled}
      onClick={onClick}
      className="h-13 w-full rounded-xl bg-primary py-4 text-base font-semibold text-primary-foreground transition active:scale-[0.99] disabled:opacity-50"
    >
      {label}
    </button>
  );

  const shell = (
    title: string,
    subtitle: React.ReactNode,
    body: React.ReactNode,
    footer?: React.ReactNode,
  ) => (
    <StepShell
      kind={cfg.label}
      total={total}
      current={stepIndex}
      onBack={() => go(-1)}
      title={title}
      subtitle={subtitle}
      footer={footer}
    >
      {body}
    </StepShell>
  );

  // ── 스텝별 렌더 ──
  if (stepId === "account") {
    return shell(
      "어느 계좌인가요?",
      "거래가 귀속될 계좌를 고르세요.",
      <AccountPicker
        accounts={accounts}
        selectedId={accountId}
        onSelect={(id) => {
          setAccountId(id);
          setPicked(null);
          setQty("");
        }}
      />,
      nextBtn("다음", !!accountId, () => go(1)),
    );
  }

  if (stepId === "symbol") {
    return shell(
      isSell ? "무엇을 팔까요?" : "어느 종목인가요?",
      "보유 종목에서 고르세요.",
      heldItems.length === 0 ? (
        <div className="rounded-xl bg-secondary p-6 text-center text-sm text-muted-foreground">
          {isSell ? "매도할 보유 종목이 없습니다." : "배당받을 보유 종목이 없습니다."}
        </div>
      ) : (
        <SymbolPicker
          onSelect={(item) => {
            setPicked(item);
            setQty("");
            go(1);
          }}
          items={heldItems}
          note={(s) =>
            `${(positions[s] ?? 0).toLocaleString()}${isCrypto(s) ? "개" : "주"}`
          }
        />
      ),
    );
  }

  if (stepId === "fromCcy") {
    const isFrom = isExchange;
    return shell(
      isExchange ? "어떤 통화를 보낼까요?" : `${cfg.label} 통화를 고르세요`,
      isExchange ? undefined : "원화 또는 외화를 선택하세요.",
      <div>
        <CurrencyChips value={cashCcy} onSelect={setCashCcy} />
        <p className="mt-3 text-sm text-muted-foreground tabular-nums">
          보유 {nativeMoney(pools[cashCcy] ?? 0, cashCcy)}
        </p>
      </div>,
      nextBtn("다음", !!cashCcy, () => {
        if (isFrom && cashCcy === toCcy) {
          const alt = ["KRW", "USD", "JPY", "EUR"].find((c) => c !== cashCcy)!;
          setToCcy(alt);
        }
        go(1);
      }),
    );
  }

  if (stepId === "toCcy") {
    return shell(
      "어떤 통화로 받을까요?",
      `보내는 통화: ${currencyMeta(cashCcy).label}`,
      <CurrencyChips value={toCcy} onSelect={setToCcy} exclude={cashCcy} />,
      nextBtn("다음", cashCcy !== toCcy, () => go(1)),
    );
  }

  if (stepId === "price") {
    const ps = priceStepsFor(picked?.symbol ?? "");
    return shell(
      "얼마에 팔았나요?",
      picked
        ? `${picked.name} · 단가(${stockCcy === "KRW" ? "원" : "달러"})`
        : undefined,
      <AmountBody
        value={price}
        onChange={setPrice}
        prefix={stockMeta.symbol}
        decimal
        quickAddSteps={ps.steps}
        quickAddLabel={ps.label}
        hint={
          stockCcy !== "KRW" && Number(price) > 0 ? (
            <span className="tabular-nums text-muted-foreground">
              ≈ ₩{Math.round(Number(price) * stockFx).toLocaleString()}
            </span>
          ) : undefined
        }
      />,
      nextBtn("다음", Number(price) > 0, () => go(1)),
    );
  }

  if (stepId === "qty") {
    return shell(
      isSell ? "몇 주 팔까요?" : "몇 주인가요?",
      isSell && picked
        ? `보유 ${heldQty.toLocaleString()}${qtyUnit}`
        : undefined,
      <AmountBody
        value={qty}
        onChange={setQty}
        suffix={qtyUnit}
        decimal={isCryptoPick}
        quickAddSteps={isCryptoPick ? [0.01, 0.1, 1] : QTY_STEPS}
        hint={
          overSell ? (
            <span className="text-rise">
              보유 수량({heldQty.toLocaleString()}
              {qtyUnit})을 초과했습니다.
            </span>
          ) : undefined
        }
      />,
      nextBtn("다음", qtyN > 0 && !overSell, () => go(1)),
    );
  }

  if (stepId === "amount") {
    // 배당은 종목 네이티브 통화, 증자·인출·환전은 선택 통화(cashCcy).
    const m = currencyMeta(
      isExchange || isCash ? cashCcy : cfg.key === "DIVIDEND" ? stockCcy : "KRW",
    );
    const stepsCfg = isCash ? amountStepsFor(cashCcy) : { steps: WON_STEPS, label: wonStepLabel };
    const hint = exchangePreview ? (
      <span className="tabular-nums">
        ≈ {nativeMoney(exchangePreview.received, toCcy)}{" "}
        <span className="text-muted-foreground">
          (1 {exchangePreview.foreign} = ₩
          {exchangePreview.rate.toLocaleString(undefined, { maximumFractionDigits: 2 })})
        </span>
      </span>
    ) : cashPreview ? (
      <span className="tabular-nums">
        ≈ {won(cashPreview.krw)}{" "}
        <span className="text-muted-foreground">
          (1 {cashCcy} = ₩
          {cashPreview.rate.toLocaleString(undefined, { maximumFractionDigits: 2 })})
        </span>
      </span>
    ) : withdrawShort ? (
      <span className="text-rise">
        보유 {nativeMoney(pools[cashCcy] ?? 0, cashCcy)} 를 초과했습니다.
      </span>
    ) : cfg.key === "WITHDRAWAL" ? (
      <span className="text-muted-foreground tabular-nums">
        보유 {nativeMoney(pools[cashCcy] ?? 0, cashCcy)}
      </span>
    ) : cfg.key === "DIVIDEND" && stockCcy !== "KRW" && amountN > 0 ? (
      <span className="tabular-nums text-muted-foreground">
        ≈ ₩{Math.round(amountN * stockFx).toLocaleString()}
      </span>
    ) : undefined;
    return shell(
      isExchange ? "얼마를 바꿀까요?" : cfg.key === "DIVIDEND" ? "배당을 얼마 받았나요?" : `${cfg.label} 금액은?`,
      isExchange ? `${currencyMeta(cashCcy).label} → ${currencyMeta(toCcy).label}` : undefined,
      <AmountBody
        value={amount}
        onChange={setAmount}
        prefix={m.symbol}
        decimal={m.digits > 0}
        quickAddSteps={stepsCfg.steps}
        quickAddLabel={stepsCfg.label}
        hint={hint}
      />,
      nextBtn(
        "다음",
        amountN > 0 && !withdrawShort && (!isExchange || cashCcy !== toCcy),
        () => go(1),
      ),
    );
  }

  if (stepId === "date") {
    return shell(
      "언제 거래했나요?",
      "대부분 오늘입니다.",
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => {
            setDate(today);
            go(1);
          }}
          className="rounded-xl bg-primary py-4 text-lg font-bold text-primary-foreground transition active:scale-[0.99]"
        >
          오늘 ({today.slice(5).replace("-", "/")})
        </button>
        <input
          type="date"
          max={today}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-12 rounded-xl border border-input bg-card px-3 text-base outline-none"
        />
      </div>,
      nextBtn("다음", !!date && date <= today, () => go(1)),
    );
  }

  // ── 리뷰 ──
  const lines: { k: string; v: string; accent?: boolean }[] = [];
  if (isSell) {
    lines.push({
      k: "단가",
      v: mode === "ledger" ? nativeMoney(effectivePrice, stockCcy) : won(effectivePrice),
    });
    lines.push({ k: "수량", v: `${qtyN.toLocaleString()}${qtyUnit}` });
    if (mode === "ledger") lines.push({ k: "거래일", v: date });
    lines.push({ k: "수수료·세금 (자동)", v: won(shownFee) });
    lines.push({ k: "매도 금액", v: won(gross), accent: true });
  } else if (cfg.key === "DIVIDEND") {
    lines.push({ k: "배당액", v: nativeMoney(amountN, stockCcy) });
    lines.push({ k: "세금 (자동)", v: won(shownFee) });
    if (mode === "ledger") lines.push({ k: "거래일", v: date });
    lines.push({ k: "실수령", v: won(amountN * stockFx - shownFee), accent: true });
  } else if (isCash) {
    lines.push({ k: "통화", v: currencyMeta(cashCcy).label });
    lines.push({ k: cfg.label + " 금액", v: nativeMoney(amountN, cashCcy) });
    if (cashPreview) lines.push({ k: "₩ 환산", v: won(cashPreview.krw) });
    if (mode === "ledger") lines.push({ k: "거래일", v: date });
  } else if (isExchange) {
    lines.push({ k: "보내는", v: nativeMoney(amountN, cashCcy) });
    lines.push({
      k: "받는 (예상)",
      v: exchangePreview ? nativeMoney(exchangePreview.received, toCcy) : "—",
      accent: true,
    });
    if (exchangePreview)
      lines.push({
        k: "환율",
        v: `1 ${exchangePreview.foreign} = ₩${exchangePreview.rate.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
      });
    if (mode === "ledger") lines.push({ k: "거래일", v: date });
  }

  return shell(
    "이대로 기록할까요?",
    "마지막 확인",
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl bg-card p-5 shadow-card">
        {cfg.needsSymbol && picked && (
          <div className="mb-3 flex items-center gap-3">
            <Avatar name={picked.name} symbol={picked.symbol} />
            <span className="flex flex-col">
              <span className="font-bold">
                {picked.name} {cfg.label}
              </span>
              <span className="text-sm text-muted-foreground">{picked.symbol}</span>
            </span>
          </div>
        )}
        <ul className="flex flex-col">
          {lines.map((l) => (
            <li
              key={l.k}
              className="flex justify-between border-b border-border py-2.5 text-sm last:border-0"
            >
              <span className="text-muted-foreground">{l.k}</span>
              <span
                className={
                  "font-bold tabular-nums " + (l.accent ? "text-primary" : "")
                }
              >
                {l.v}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* 수수료·세금 직접 수정(선택) */}
      {hasFee &&
        (feeOpen ? (
          <NumberPadField
            label="수수료·세금 (원) — 비우면 자동"
            value={fee}
            onChange={setFee}
            prefix="₩"
            placeholder={`자동 ₩${estFee.toLocaleString()}`}
          />
        ) : (
          <button
            type="button"
            onClick={() => setFeeOpen(true)}
            className="text-center text-xs text-muted-foreground underline"
          >
            수수료·세금 직접 수정
          </button>
        ))}

      {error && <p className="text-center text-sm text-rise">{error}</p>}
    </div>,
    nextBtn(pending ? "기록 중…" : cfg.verb, canSubmit && !pending, submit),
  );
}
