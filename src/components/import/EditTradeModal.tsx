"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Trash2, X } from "lucide-react";
import { updateTradeEvent, deleteEvent } from "@/app/transactions/actions";
import { isCrypto } from "@/lib/securities";
import { nativeMoney } from "@/lib/finance/currencies";
import { Avatar } from "@/components/ui/Avatar";
import { useMounted } from "@/components/ui/useMounted";
import type { YearTrade } from "./QuickEntryForm";

/**
 * 거래 수정·삭제 모달(바텀시트) — 목록 행을 누르면 열린다.
 * 수량·매수가·날짜만 수정(종목·통화·환율은 원본 유지). 삭제는 2단계 확인.
 * trade 가 바뀌면 key 로 리마운트돼 입력값이 초기화된다.
 */
export function EditTradeModal({
  trade,
  today,
  onClose,
}: {
  trade: YearTrade;
  today: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const mounted = useMounted();
  const [pending, start] = useTransition();
  const [qty, setQty] = useState(String(trade.quantity));
  const [price, setPrice] = useState(String(trade.priceNative));
  const [date, setDate] = useState(trade.date);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 열려있는 동안 body 스크롤 락 + ESC 닫기(BottomSheet와 동일 패턴)
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const qtyN = Number(qty);
  const priceN = Number(price);
  const unit = isCrypto(trade.symbol) ? "개" : "주";
  const total = qtyN > 0 && priceN > 0 ? qtyN * priceN : 0;
  const canSave = qtyN > 0 && priceN > 0 && !!date;

  function save() {
    if (!canSave) return;
    setError(null);
    start(async () => {
      const res = await updateTradeEvent({
        id: trade.id,
        quantity: qtyN,
        priceNative: priceN,
        date,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  function remove() {
    setError(null);
    start(async () => {
      const res = await deleteEvent(trade.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  const fieldClass =
    "h-12 w-full rounded-xl border border-input bg-card px-3 text-base outline-none focus:border-primary";

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-card p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 — 종목·유형(수정 불가) */}
        <div className="flex items-center gap-3">
          <Avatar name={trade.name} symbol={trade.symbol} size="md" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-bold">{trade.name}</span>
            <span className="text-xs text-muted-foreground">
              {trade.symbol} ·{" "}
              <span className={trade.type === "BUY" ? "text-rise" : "text-fall"}>
                {trade.type === "BUY" ? "매수" : "매도"}
              </span>
            </span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="touch-target ml-auto shrink-0 text-muted-foreground"
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>

        {/* 수정 필드 */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              {trade.type === "BUY" ? "매수가" : "매도가"} (
              {trade.currency === "KRW" ? "원" : trade.currency})
            </span>
            <input
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
              className={fieldClass + " tabular-nums"}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">수량</span>
            <input
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ""))}
              className={fieldClass + " tabular-nums"}
            />
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">거래일</span>
            <input
              type="date"
              max={today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={fieldClass}
            />
          </label>
        </div>

        {/* 총액 */}
        <div className="mt-3 flex items-center justify-between rounded-xl bg-secondary px-4 py-3">
          <span className="text-sm text-muted-foreground">
            {trade.type === "BUY" ? "매수총액" : "매도총액"}
          </span>
          <span className="text-lg font-bold tabular-nums">
            {total > 0 ? nativeMoney(total, trade.currency) : "—"}
          </span>
        </div>

        {error && <p className="mt-3 text-sm text-rise">{error}</p>}

        {/* 액션 */}
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled={!canSave || pending}
            onClick={save}
            className="h-12 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground transition active:scale-[0.99] disabled:opacity-50"
          >
            {pending ? "저장 중…" : "수정 완료"}
          </button>

          {confirmDelete ? (
            <div className="flex items-center gap-2 rounded-xl bg-rise/10 p-2">
              <span className="pl-1 text-sm text-rise">정말 삭제할까요?</span>
              <button
                type="button"
                disabled={pending}
                onClick={remove}
                className="ml-auto rounded-lg bg-rise px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                삭제
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg bg-secondary px-3 py-2 text-sm font-semibold text-secondary-foreground"
              >
                취소
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirmDelete(true)}
              className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-rise transition active:scale-[0.99] disabled:opacity-50"
            >
              <Trash2 size={16} /> 이 거래 삭제
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
