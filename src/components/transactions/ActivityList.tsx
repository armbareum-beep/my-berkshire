"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteEvent, reverseEvent } from "@/app/transactions/actions";
import { findCatalogItem } from "@/lib/finance/catalog";
import { nativeMoney } from "@/lib/finance/currencies";
import { signedWon } from "@/lib/format";
import { EVENT_ICON, IconChip } from "@/components/transactions/eventIcons";
import type { EventType } from "@/lib/finance/valuation";

export interface ActivityItem {
  id: string;
  type: EventType;
  symbol: string | null;
  quantity: number | null;
  priceOrAmount: number;
  feeAndTax: number;
  date: string;
  status: "active" | "deleted" | "reversal" | "reversed";
  /** 네이티브 통화·환율(외화 증자/인출/환전 표시용). 기본 KRW/1. */
  currency?: string;
  fxRate?: number;
  toCurrency?: string | null;
  toAmount?: number | null;
  /** 'auto'(자동 동기화) | 'manual'(직접 입력). 배당 출처 뱃지용. */
  source?: string;
}

const LABEL: Record<EventType, string> = {
  BUY: "매수",
  SELL: "매도",
  DIVIDEND: "배당",
  DEPOSIT: "증자",
  WITHDRAWAL: "인출",
  EXCHANGE: "환전",
};

/**
 * 거래의 ₩ 현금 효과(기능통화 장부 기준 — valuation.cashPools 와 동일 부호).
 * 매수·인출=음수, 매도·배당·증자=양수. 환전은 잔액 중립이라 앵커 없음(null).
 */
function krwDelta(it: ActivityItem): number | null {
  switch (it.type) {
    case "DEPOSIT":
      return it.priceOrAmount;
    case "DIVIDEND":
      return it.priceOrAmount - it.feeAndTax; // 원천징수 차감 순액
    case "WITHDRAWAL":
      return -it.priceOrAmount;
    case "BUY":
      return it.quantity ? -(it.quantity * it.priceOrAmount + it.feeAndTax) : null;
    case "SELL":
      return it.quantity ? it.quantity * it.priceOrAmount - it.feeAndTax : null;
    default:
      return null; // EXCHANGE
  }
}

/** 보조줄 — 오른쪽 금액 앵커와 중복되지 않는 맥락 정보(주수·단가·세금·환전·외화 네이티브). */
function detail(it: ActivityItem, names: Record<string, string>): string {
  const name = it.symbol
    ? (names[it.symbol] ?? findCatalogItem(it.symbol)?.name ?? it.symbol)
    : "";
  const ccy = it.currency ?? "KRW";
  const fx = it.fxRate && it.fxRate > 0 ? it.fxRate : 1;
  if (it.type === "BUY" || it.type === "SELL")
    return `${name} ${it.quantity}주 · @${it.priceOrAmount.toLocaleString()}`;
  if (it.type === "DIVIDEND") {
    const tax =
      it.feeAndTax > 0 ? ` · 세 ₩${Math.round(it.feeAndTax).toLocaleString()}` : "";
    return `${name}${tax}`;
  }
  if (it.type === "EXCHANGE") {
    const toCcy = it.toCurrency ?? "KRW";
    const toAmt = it.toAmount ?? 0;
    const foreign = ccy !== "KRW" ? ccy : toCcy;
    const rate = ccy !== "KRW" ? fx : toAmt > 0 ? it.priceOrAmount / toAmt : null;
    const rateStr =
      rate != null
        ? ` · 1${foreign}=₩${rate.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
        : "";
    return `${nativeMoney(it.priceOrAmount / fx, ccy)} → ${nativeMoney(toAmt, toCcy)}${rateStr}`;
  }
  // 증자·인출 — 외화면 네이티브 표기(₩ 앵커와 보완). ₩이면 보조줄엔 금액 생략(날짜만).
  return ccy !== "KRW" ? nativeMoney(it.priceOrAmount / fx, ccy) : "";
}

export function ActivityList({
  items,
  names,
  mode,
  today,
}: {
  items: ActivityItem[];
  /** 종목코드 → 종목명(securities/카탈로그). */
  names: Record<string, string>;
  mode: "ledger" | "challenge" | "live";
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // 인앱 확인(sonner 액션) — 네이티브 window.confirm 대신 토스 무드 유지.
  function runDelete(id: string) {
    toast("이 거래를 삭제할까요? 자산·수익률 계산에서 제외됩니다.", {
      action: {
        label: "삭제",
        onClick: () =>
          startTransition(async () => {
            const res = await deleteEvent(id);
            if (!res.ok) toast.error(res.error);
            else {
              toast.success("삭제되었습니다");
              router.refresh();
            }
          }),
      },
    });
  }
  function runReverse(id: string) {
    toast("취소하면 매입원가(현재 시세 아님)가 현금으로 돌아갑니다. 취소할까요?", {
      action: {
        label: "취소 처리",
        onClick: () =>
          startTransition(async () => {
            const res = await reverseEvent(id);
            if (!res.ok) toast.error(res.error);
            else {
              toast.success("취소(상쇄)되었습니다");
              router.refresh();
            }
          }),
      },
    });
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-card p-6 text-center shadow-card">
        <p className="text-sm text-muted-foreground">
          회사의 역사는 첫 거래에서 시작됩니다.
        </p>
        <Link
          href="/transactions"
          className="mt-4 inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition active:scale-[0.99]"
        >
          첫 거래 기록하기
        </Link>
      </div>
    );
  }

  return (
    <ul className="stagger flex flex-col gap-2">
      {items.map((it) => {
        const muted = it.status !== "active";
        const canDelete =
          it.status === "active" && (mode === "ledger" || it.date === today);
        const canReverse =
          it.status === "active" && mode !== "ledger" && it.date !== today;
        const delta = krwDelta(it);
        const sub = detail(it, names);
        return (
          <li
            key={it.id}
            className={
              "rounded-2xl bg-card p-4 shadow-card" + (muted ? " opacity-50" : "")
            }
          >
            <div className="flex items-center gap-3">
              {/* 유형 아이콘(모노톤) — 종목명은 보조줄 텍스트로 */}
              <IconChip icon={EVENT_ICON[it.type]} size="md" type={it.type} />
              <span className="flex min-w-0 flex-col">
                <span className="font-bold">
                  {LABEL[it.type]}
                  {it.type === "DIVIDEND" && it.source === "auto" && (
                    <span className="ml-1.5 rounded-full bg-secondary px-1.5 py-0.5 align-middle text-[10px] font-semibold text-muted-foreground">
                      자동
                    </span>
                  )}
                  {it.status === "deleted" && " · 삭제됨"}
                  {it.status === "reversed" && " · 상쇄됨"}
                  {it.status === "reversal" && " · 취소 이벤트"}
                </span>
                <span className="truncate text-sm text-muted-foreground">
                  {sub ? `${sub} · ${it.date}` : it.date}
                </span>
              </span>
              {/* 오른쪽 앵커 — 굵은 ₩ 현금효과(부호 O, 무채색) + 액션.
                  환전은 잔액 중립이라 헤드라인 숫자 없이 보조줄 from→to 로만. */}
              <span className="ml-auto flex flex-col items-end gap-1.5">
                {delta !== null && (
                  <span className="font-bold tabular-nums">{signedWon(delta)}</span>
                )}
                {(canDelete || canReverse) && (
                  <span className="flex gap-2">
                    {canDelete && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => runDelete(it.id)}
                        className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"
                      >
                        삭제
                      </button>
                    )}
                    {canReverse && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => runReverse(it.id)}
                        className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"
                      >
                        취소
                      </button>
                    )}
                  </span>
                )}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
