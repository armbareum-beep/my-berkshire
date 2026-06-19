"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Landmark, Home } from "lucide-react";
import { IconChip } from "@/components/transactions/eventIcons";
import { TYPES, HUB_TYPES, type TypeCfg } from "@/components/transactions/eventTypes";
import { TxnWizard } from "@/components/transactions/wizard/TxnWizard";
import { BuyWizard } from "@/components/transactions/wizard/BuyWizard";
import { LiabilityForm } from "@/components/networth/LiabilityForm";
import { ManualAssetForm } from "@/components/networth/ManualAssetForm";
import { BackButton } from "@/components/BackButton";
import { findCatalogItem } from "@/lib/finance/catalog";
import type { EventType } from "@/lib/finance/valuation";
import type { AccountType } from "@/lib/config/tax";

export interface AccountOption {
  id: string;
  name: string;
  accountType: AccountType;
  commissionRate: number;
}

/**
 * 거래 입력 — "무엇을 기록할까요?" 허브 + 인라인 대출·실물자산 폼.
 * 이벤트(매수/매도/배당/증자/인출/환전)는 목업식 위저드로 라우팅:
 *   BUY → BuyWizard(장바구니), 그 외 → TxnWizard. 거래 로직·서버 액션은 위저드 안에서 그대로.
 */
export function TransactionFlow({
  mode,
  today,
  accounts,
  positionsByAccount,
  pools,
  fxRates,
  initialType,
  initialCcy,
  initialSymbol,
  initialQty,
  returnTo,
  prices,
  names,
}: {
  mode: "ledger" | "challenge" | "live";
  today: string;
  accounts: AccountOption[];
  positionsByAccount: Record<string, Record<string, number>>;
  pools: Record<string, number>;
  fxRates: Record<string, number>;
  initialType?: EventType;
  initialCcy?: string;
  initialSymbol?: string;
  initialQty?: number;
  returnTo?: string;
  prices: Record<string, number>;
  names: Record<string, string>;
}) {
  const router = useRouter();
  const [cfg, setCfg] = useState<TypeCfg | null>(
    () => TYPES.find((t) => t.key === initialType) ?? null,
  );
  const [debt, setDebt] = useState(false);
  const [manualAsset, setManualAsset] = useState(false);

  const exit = () => (returnTo ? router.push(returnTo) : setCfg(null));

  // ── 대출(부채) 등록 — events 가 아니라 liabilities ──
  if (debt) {
    return (
      <main className="flex min-h-dvh flex-col p-6 pb-28">
        <button
          type="button"
          onClick={() => (returnTo ? router.push(returnTo) : setDebt(false))}
          className="mb-2 -ml-1 w-fit cursor-pointer text-2xl text-muted-foreground"
          aria-label="이전"
        >
          ‹
        </button>
        <div className="flex items-center gap-2.5">
          <IconChip icon={Landmark} size="md" />
          <h1 className="text-2xl font-extrabold tracking-tight">대출</h1>
        </div>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">
          대출·부채를 등기합니다. 순자산(자산 − 부채)과 레버리지에 반영돼요.
        </p>
        <p className="mb-5 rounded-xl bg-secondary px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          대출금이 이미 주식·부동산 등 자산에 들어가 있다면 잔액만 적으면 돼요. 아직
          현금으로 갖고 있다면, 등록 후 ‘증자’로 그 현금을 따로 넣어 주세요.
        </p>
        <LiabilityForm
          today={today}
          onSaved={() => router.push(returnTo ?? "/dashboard")}
          onCancel={() => (returnTo ? router.push(returnTo) : setDebt(false))}
        />
      </main>
    );
  }

  // ── 실물·대체 자산(부동산 등 수기 평가) 등록 — manual_assets(순자산 합산, XIRR 제외) ──
  if (manualAsset) {
    return (
      <main className="flex min-h-dvh flex-col p-6 pb-28">
        <button
          type="button"
          onClick={() => (returnTo ? router.push(returnTo) : setManualAsset(false))}
          className="mb-2 -ml-1 w-fit cursor-pointer text-2xl text-muted-foreground"
          aria-label="이전"
        >
          ‹
        </button>
        <div className="flex items-center gap-2.5">
          <IconChip icon={Home} size="md" />
          <h1 className="text-2xl font-extrabold tracking-tight">실물·대체 자산</h1>
        </div>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">
          부동산·비상장 등 시세가 없는 자산을 등록합니다. 순자산에만 반영되고,
          투자 수익률(XIRR)엔 영향이 없어요.
        </p>
        <ManualAssetForm
          today={today}
          onSaved={() => router.push(returnTo ?? "/dashboard")}
          onCancel={() => (returnTo ? router.push(returnTo) : setManualAsset(false))}
        />
      </main>
    );
  }

  // ── 거래 종류 허브 ──
  if (!cfg) {
    return (
      <main className="flex min-h-dvh flex-col p-6 pb-28">
        <BackButton />
        <h1 className="mb-6 text-2xl font-extrabold tracking-tight">
          무엇을 기록할까요?
        </h1>
        <div className="grid grid-cols-2 gap-3">
          {HUB_TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setCfg(t)}
              className="flex flex-col items-start gap-1.5 rounded-2xl bg-card p-5 text-left shadow-card transition active:scale-[0.98]"
            >
              <IconChip icon={t.Icon} size="lg" type={t.key} />
              <span className="font-bold">{t.label}</span>
              <span className="text-xs text-muted-foreground">{t.sub}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setDebt(true)}
            className="flex flex-col items-start gap-1.5 rounded-2xl bg-card p-5 text-left shadow-card transition active:scale-[0.98]"
          >
            <IconChip icon={Landmark} size="lg" />
            <span className="font-bold">대출</span>
            <span className="text-xs text-muted-foreground">대출·부채 등록</span>
          </button>
          <button
            type="button"
            onClick={() => setManualAsset(true)}
            className="flex flex-col items-start gap-1.5 rounded-2xl bg-card p-5 text-left shadow-card transition active:scale-[0.98]"
          >
            <IconChip icon={Home} size="lg" />
            <span className="font-bold">실물·대체 자산</span>
            <span className="text-xs text-muted-foreground">부동산·비상장 등록</span>
          </button>
        </div>
      </main>
    );
  }

  // ── 이벤트 → 위저드 ──
  if (cfg.key !== "BUY") {
    return (
      <TxnWizard
        cfg={cfg}
        mode={mode}
        today={today}
        accounts={accounts}
        positionsByAccount={positionsByAccount}
        pools={pools}
        fxRates={fxRates}
        prices={prices}
        names={names}
        initialCcy={initialCcy}
        initialSymbol={initialSymbol}
        initialQty={initialQty}
        returnTo={returnTo}
        onExit={exit}
      />
    );
  }

  return (
    <BuyWizard
      mode={mode}
      today={today}
      accounts={accounts}
      pools={pools}
      fxRates={fxRates}
      prices={prices}
      names={names}
      initialSymbol={initialSymbol}
      initialName={
        initialSymbol
          ? (names[initialSymbol] ??
            findCatalogItem(initialSymbol)?.name ??
            initialSymbol)
          : undefined
      }
      initialQty={initialQty}
      returnTo={returnTo}
      onExit={exit}
    />
  );
}
