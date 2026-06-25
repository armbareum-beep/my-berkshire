"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QuickAdd, QTY_STEPS, priceStepsFor } from "@/components/ui/QuickAdd";
import { SymbolAvatar } from "./SymbolPicker";
import { SymbolSearch } from "./SymbolSearch";
import { recordFirstBuy } from "@/app/onboarding/actions";
import { useMarketPrice } from "@/lib/finance/useMarketPrice";
import type { CatalogItem } from "@/lib/finance/catalog";

/**
 * 첫 인수(매수) 입력 — J4 와 /acquire 공용.
 * challenge: 거래일=오늘 고정(날짜 칸 없음). ledger: 과거 날짜 선택 허용(레일 5-2).
 * (전체 S1~S5 자동전진 시퀀스는 STEP 4에서 구현. 여기선 핵심 입력만.)
 */
export function BuyForm({
  mode,
  today,
  prices,
}: {
  mode: "challenge" | "ledger";
  today: string;
  /** 카탈로그 종목 현재가(서버 조회 전달). 챌린지 가격 표시용. */
  prices: Record<string, number>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [picked, setPicked] = useState<CatalogItem | null>(null);
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("1"); // 기본 1주(머리 안 쓰게)
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);

  // 종목 선택 — 장부 모드면 단가를 현재가(시드)로 미리 채움(편집 가능).
  function pick(item: CatalogItem) {
    setPicked(item);
    if (mode === "ledger" && prices[item.symbol] != null)
      setPrice(String(prices[item.symbol]));
  }

  // 챌린지는 현재 시세로 강제(못 바꿈). 장부는 사용자가 입력한 매입가.
  // 검색으로 고른 비카탈로그 종목은 useMarketPrice 가 즉시 시세를 가져온다.
  const marketPrice = useMarketPrice(picked?.symbol ?? null, prices);
  const effectivePrice = mode === "challenge" ? (marketPrice ?? 0) : Number(price);
  const qtyN = Number(qty);
  const total = effectivePrice > 0 && qtyN > 0 ? effectivePrice * qtyN : 0;
  const canSubmit = picked && effectivePrice > 0 && qtyN > 0;

  function submit() {
    if (!picked) return;
    setError(null);
    startTransition(async () => {
      const res = await recordFirstBuy({
        symbol: picked.symbol,
        name: picked.name,
        quantity: qtyN,
        price: effectivePrice,
        date: mode === "challenge" ? today : date,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push("/dashboard?welcome=1");
    });
  }

  if (!picked) {
    return (
      <div>
        <p className="mb-4 text-sm text-muted-foreground">무엇을 매수할까요?</p>
        <SymbolSearch onSelect={pick} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3 rounded-xl bg-secondary p-3">
        <SymbolAvatar name={picked.name} symbol={picked.symbol} />
        <span className="flex flex-col">
          <span className="font-bold">{picked.name}</span>
          <span className="text-sm text-muted-foreground">{picked.symbol}</span>
        </span>
        <button
          type="button"
          onClick={() => setPicked(null)}
          className="ml-auto text-sm text-muted-foreground underline"
        >
          변경
        </button>
      </div>

      {mode === "challenge" ? (
        <div>
          <label className="text-sm font-medium">현재가 (원)</label>
          <p className="mt-2 flex h-12 items-center rounded-xl bg-secondary px-3 text-lg font-bold tabular-nums">
            {marketPrice != null
              ? `₩${marketPrice.toLocaleString()}`
              : "시세 불러오는 중"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            챌린지는 오늘 시세로 매수합니다. 가격은 바꿀 수 없어요.
          </p>
        </div>
      ) : (
        <div>
          <label className="text-sm font-medium">매입 단가 (원)</label>
          <Input
            type="number"
            inputMode="numeric"
            placeholder="예: 75000"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="mt-2 h-12 text-lg"
          />
          {picked && (
            <QuickAdd
              value={price}
              onChange={setPrice}
              {...priceStepsFor(picked.symbol)}
            />
          )}
        </div>
      )}

      <div>
        <label className="text-sm font-medium">수량 (주)</label>
        <Input
          type="number"
          inputMode="numeric"
          placeholder="예: 10"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="mt-2 h-12 text-lg"
        />
        <QuickAdd value={qty} onChange={setQty} steps={QTY_STEPS} />
      </div>

      {mode === "ledger" && (
        <div>
          <label className="text-sm font-medium">거래일</label>
          <Input
            type="date"
            max={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-2 h-12"
          />
        </div>
      )}

      {total > 0 && (
        <p className="text-center text-base tabular-nums">
          = ₩{total.toLocaleString()}{" "}
          <span className="text-muted-foreground">
            ({qtyN}주 × {effectivePrice.toLocaleString()})
          </span>
        </p>
      )}

      {error && <p className="text-sm text-rise">{error}</p>}

      <Button
        onClick={submit}
        disabled={!canSubmit || pending}
        className="h-13 w-full bg-primary py-4 text-base font-semibold text-primary-foreground"
      >
        {pending ? "체결 중…" : "매수"}
      </Button>
    </div>
  );
}
