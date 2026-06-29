"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { recordBuys } from "@/app/transactions/actions";
import { useMarketPrice } from "@/lib/finance/useMarketPrice";
import { isCrypto } from "@/lib/securities";
import { nativeMoney } from "@/lib/finance/currencies";
import { won } from "@/lib/format";
import { QTY_STEPS, priceStepsFor } from "@/components/ui/QuickAdd";
import { Avatar } from "@/components/ui/Avatar";
import { SymbolSearch } from "@/components/onboarding/SymbolSearch";
import { StepShell } from "./StepShell";
import { SuccessOverlay } from "./SuccessOverlay";
import { AmountBody } from "./steps";
import { AccountPicker } from "./AccountPicker";
import type { AccountOption } from "@/components/transactions/TransactionFlow";

interface CartItem {
  symbol: string;
  name: string;
  quantity: number;
  price: number; // 네이티브 단가(장부=입력, 챌린지=시세 캡처)
}

/** 종목 통화 휴리스틱(단건 BUY 와 동일): 6자리=KRW, 그 외=USD. ₩ 추정 표시용. */
function ccyHeuristic(symbol: string): "KRW" | "USD" {
  return /^\d{6}$/.test(symbol) ? "KRW" : "USD";
}

/**
 * 장부 단가 프리필 — prices 는 ₩ 환산값이므로 종목 네이티브 통화로 되돌린다.
 * (단가 입력 필드는 네이티브: USD 종목이면 $ 값. ₩값을 그대로 두면 서버가 환율을 또 곱한다.)
 */
function prefillNativePrice(
  symbol: string,
  prices: Record<string, number>,
  fxRates: Record<string, number>,
): string {
  const krw = prices[symbol];
  if (krw == null) return "";
  if (ccyHeuristic(symbol) === "KRW") return String(Math.round(krw));
  const fx = fxRates.USD ?? 1;
  return String(Math.round((krw / fx) * 100) / 100);
}

type Stage = "account" | "symbol" | "price" | "qty" | "cart";

/**
 * 매수 위저드(목업식) — 한 종목씩 검색→단가→수량으로 담고 "또 담기"로 추가,
 * 장바구니에서 자금출처·날짜 정하고 한 번에 체결. recordBuys 페이로드는 MultiBuyForm 과 동일.
 */
export function BuyWizard({
  mode,
  today,
  accounts,
  pools,
  fxRates,
  prices,
  names,
  initialSymbol,
  initialName,
  initialQty,
  defaultFundingSource = "cash",
  returnTo,
  onExit,
}: {
  mode: "ledger" | "challenge" | "live";
  today: string;
  accounts: AccountOption[];
  pools: Record<string, number>;
  fxRates: Record<string, number>;
  prices: Record<string, number>;
  names: Record<string, string>;
  initialSymbol?: string;
  initialName?: string;
  initialQty?: number;
  defaultFundingSource?: "cash" | "deposit";
  returnTo?: string;
  onExit: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [adding, setAdding] = useState<{ symbol: string; name: string } | null>(
    initialSymbol
      ? { symbol: initialSymbol, name: initialName ?? names[initialSymbol] ?? initialSymbol }
      : null,
  );
  const [addPrice, setAddPrice] = useState(() =>
    initialSymbol && mode === "ledger"
      ? prefillNativePrice(initialSymbol, prices, fxRates)
      : "",
  );
  const [addQty, setAddQty] = useState(initialQty ? String(initialQty) : "");
  const [fundingSource, setFundingSource] = useState<"cash" | "deposit">(
    defaultFundingSource,
  );
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ title: string; sub?: string } | null>(null);

  const [stage, setStage] = useState<Stage>(() => {
    if (initialSymbol) return mode === "ledger" ? "price" : "qty";
    if (accounts.length > 1) return "account";
    return "symbol";
  });
  // USD 종목 매수 시 원화로 직접 입력하는 모드(달러 단가를 역산해 저장).
  const [priceModeKrw, setPriceModeKrw] = useState(false);

  const addMarket = useMarketPrice(adding?.symbol ?? null, prices);
  const addIsCrypto = !!adding && isCrypto(adding.symbol);
  const addUnit = addIsCrypto ? "개" : "주";
  // 단가는 종목의 네이티브 통화로 입력한다(서버가 그 통화로 해석해 ₩ 환산).
  // ₩로 라벨만 붙이고 USD 종목 값을 받으면 서버가 환율을 또 곱해 ~1500× 부풀려진다.
  const addCcy = adding ? ccyHeuristic(adding.symbol) : "KRW";
  const addFx = addCcy === "KRW" ? 1 : (fxRates.USD ?? 1);
  // KRW 원화입력 모드: USD 종목에서만 활성. 입력값은 ₩, commitAdd에서 ÷ 환율로 $ 역산.
  const isKrwInputMode = addCcy !== "KRW" && priceModeKrw;
  const priceCur = isKrwInputMode ? "₩" : (addCcy === "KRW" ? "₩" : "$");
  const priceUnitLabel = isKrwInputMode ? "원" : (addCcy === "KRW" ? "원" : "달러");

  // ₩ 추정 합계(서버가 최종 환산 — 여긴 미리보기).
  const krwOf = (it: CartItem) => {
    const ccy = ccyHeuristic(it.symbol);
    const rate = ccy === "KRW" ? 1 : (fxRates.USD ?? 1);
    return it.quantity * it.price * rate;
  };
  const totalKrw = cart.reduce((s, it) => s + krwOf(it), 0);

  function startAddAnother() {
    setAdding(null);
    setAddPrice("");
    setAddQty("");
    setPriceModeKrw(false);
    setStage("symbol");
  }

  function commitAdd() {
    if (!adding) return;
    const q = Number(addQty);
    let p: number;
    if (mode === "ledger") {
      const raw = Number(addPrice);
      // 원화 입력 모드: ₩ ÷ 환율 → $ 단가(서버는 $ 단가를 받아 ₩ 환산).
      p = isKrwInputMode ? raw / addFx : raw;
    } else {
      p = addMarket ?? 0;
    }
    if (q <= 0 || p <= 0) return;
    setCart((prev) => [
      ...prev,
      { symbol: adding.symbol, name: adding.name, quantity: q, price: p },
    ]);
    setAdding(null);
    setAddPrice("");
    setAddQty("");
    setPriceModeKrw(false);
    setStage("cart");
  }

  function submit() {
    if (cart.length === 0) return;
    setError(null);
    start(async () => {
      const res = await recordBuys({
        items: cart.map((it) => ({
          symbol: it.symbol,
          name: it.name,
          quantity: it.quantity,
          price: it.price,
        })),
        accountId,
        date: mode === "ledger" ? date : today,
        fundingSource,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone({
        title: `${cart.length}개 매수되었습니다`,
        sub: res.note ?? "회사 연혁에 기록됨",
      });
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

  // 뒤로: add 서브플로우는 단계별, 첫 진입은 onExit/카트.
  function back() {
    setError(null);
    if (stage === "account") return onExit();
    if (stage === "symbol") return cart.length > 0 ? setStage("cart") : onExit();
    if (stage === "price") return setStage("symbol");
    if (stage === "qty") return setStage(mode === "ledger" ? "price" : "symbol");
    if (stage === "cart") return onExit();
  }

  const shell = (
    title: string,
    subtitle: React.ReactNode,
    body: React.ReactNode,
    footer?: React.ReactNode,
  ) => (
    <StepShell
      kind="매수"
      total={0}
      current={0}
      onBack={back}
      title={title}
      subtitle={subtitle}
      footer={footer}
    >
      {body}
    </StepShell>
  );

  if (stage === "account") {
    return shell(
      "어느 계좌인가요?",
      "매수가 귀속될 계좌를 고르세요.",
      <AccountPicker
        accounts={accounts}
        selectedId={accountId}
        onSelect={setAccountId}
      />,
      nextBtn("다음", !!accountId, () => setStage("symbol")),
    );
  }

  if (stage === "symbol") {
    return shell(
      "무엇을 살까요?",
      "종목·코인을 검색해 고르세요.",
      <SymbolSearch
        onSelect={(item) => {
          setAdding(item);
          setAddPrice(
            mode === "ledger"
              ? prefillNativePrice(item.symbol, prices, fxRates)
              : "",
          );
          setAddQty("");
          setStage(mode === "ledger" ? "price" : "qty");
        }}
      />,
    );
  }

  if (stage === "price") {
    const ps = priceStepsFor(adding?.symbol ?? "");
    const priceHint =
      Number(addPrice) > 0
        ? isKrwInputMode
          ? `≈ $${(Number(addPrice) / addFx).toFixed(2)}`
          : addCcy !== "KRW"
            ? `≈ ₩${Math.round(Number(addPrice) * addFx).toLocaleString()}`
            : undefined
        : undefined;
    return shell(
      "얼마에 샀나요?",
      adding ? `${adding.name} · 단가(${priceUnitLabel})` : undefined,
      <div className="flex flex-col gap-4">
        {addCcy !== "KRW" && (
          <div className="flex justify-center gap-2">
            {(["달러로 입력", "원화로 입력"] as const).map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => { setPriceModeKrw(i === 1); setAddPrice(""); }}
                className={
                  "rounded-full px-4 py-1.5 text-sm font-semibold " +
                  ((i === 1) === priceModeKrw
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground")
                }
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <AmountBody
          value={addPrice}
          onChange={setAddPrice}
          prefix={priceCur}
          decimal
          quickAddSteps={isKrwInputMode ? undefined : ps.steps}
          quickAddLabel={isKrwInputMode ? undefined : ps.label}
          hint={
            priceHint ? (
              <span className="tabular-nums text-muted-foreground">{priceHint}</span>
            ) : undefined
          }
        />
      </div>,
      nextBtn("다음", Number(addPrice) > 0, () => setStage("qty")),
    );
  }

  if (stage === "qty") {
    const priceNow = mode === "ledger" ? Number(addPrice) : (addMarket ?? 0);
    // ledger 입력가: KRW 직접 입력이면 그대로, 네이티브(USD)이면 ×환율 → ₩. 챌린지/라이브는 addMarket 이 이미 ₩.
    const priceKrwUnit =
      mode === "ledger"
        ? isKrwInputMode
          ? priceNow // 이미 ₩
          : priceNow * addFx // 네이티브(예: $) → ₩
        : priceNow;
    return shell(
      "몇 주 살까요?",
      adding
        ? mode === "ledger"
          ? `${adding.name} · ${priceCur}${Number(addPrice).toLocaleString()}`
          : `${adding.name} · 현재가 ${addMarket != null ? `₩${addMarket.toLocaleString()}` : "불러오는 중"}`
        : undefined,
      <AmountBody
        value={addQty}
        onChange={setAddQty}
        suffix={addUnit}
        decimal={addIsCrypto}
        quickAddSteps={addIsCrypto ? [0.01, 0.1, 1] : QTY_STEPS}
        hint={
          Number(addQty) > 0 && priceNow > 0 ? (
            <span className="tabular-nums text-muted-foreground">
              = ₩{Math.round(priceKrwUnit * Number(addQty)).toLocaleString()}
            </span>
          ) : undefined
        }
      />,
      nextBtn(
        "담기",
        Number(addQty) > 0 && priceNow > 0,
        commitAdd,
      ),
    );
  }

  // ── 장바구니(리뷰) ──
  return shell(
    "장바구니",
    cart.length > 0 ? `${cart.length}종목 담음` : "담은 종목이 없어요",
    <div className="flex flex-col gap-4">
      {cart.length > 0 && (
        <ul className="flex flex-col gap-2">
          {cart.map((it, i) => (
            <li
              key={`${it.symbol}-${i}`}
              className="flex items-center gap-3 rounded-xl bg-secondary p-3"
            >
              <Avatar name={it.name} symbol={it.symbol} size="md" />
              <span className="flex flex-col">
                <span className="font-bold">{it.name}</span>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {it.quantity.toLocaleString()}
                  {isCrypto(it.symbol) ? "개" : "주"} · {it.price.toLocaleString()}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setCart((p) => p.filter((_, j) => j !== i))}
                aria-label="삭제"
                className="ml-auto text-muted-foreground"
              >
                <Trash2 size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={startAddAnother}
        className="rounded-xl border border-dashed border-border py-3 text-sm font-semibold text-muted-foreground transition active:scale-[0.99]"
      >
        + 종목 더 담기
      </button>

      {cart.length > 0 && (
        <>
          <div>
            <p className="text-sm font-medium">이 돈, 어디서?</p>
            <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
              회사 현금 {nativeMoney(pools.KRW ?? 0, "KRW")}
              {(pools.USD ?? 0) > 0 && ` · ${nativeMoney(pools.USD, "USD")}`}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["cash", "deposit"] as const).map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setFundingSource(src)}
                  className={
                    "rounded-xl px-3 py-2.5 text-sm font-semibold " +
                    (fundingSource === src
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground")
                  }
                >
                  {src === "cash" ? "있던 현금으로" : "새 돈으로 (증자)"}
                </button>
              ))}
            </div>
            {fundingSource === "deposit" && (
              <p className="mt-2 text-xs text-muted-foreground">
                매수액만큼 증자돼요(투입 원금↑, 기존 현금 유지).
              </p>
            )}
          </div>

          {mode === "ledger" && (
            <div>
              <label className="text-sm font-medium">거래일</label>
              <input
                type="date"
                max={today}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-2 h-12 w-full rounded-xl border border-input bg-card px-3 text-base outline-none"
              />
            </div>
          )}

          <p className="text-center text-base tabular-nums">
            합계 예상 {won(totalKrw)}{" "}
            <span className="text-sm text-muted-foreground">({cart.length}종목)</span>
          </p>

          {error && <p className="text-center text-sm text-rise">{error}</p>}
        </>
      )}
    </div>,
    cart.length > 0
      ? nextBtn(pending ? "체결 중…" : `${cart.length}개 매수`, !pending, submit)
      : undefined,
  );
}
