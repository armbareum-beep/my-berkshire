"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordEvent } from "@/app/transactions/actions";
import { isCrypto } from "@/lib/securities";
import { nativeMoney } from "@/lib/finance/currencies";
import { Avatar } from "@/components/ui/Avatar";
import { SymbolSearch } from "@/components/onboarding/SymbolSearch";
import { EditTradeModal } from "./EditTradeModal";

interface Account {
  id: string;
  name: string;
}

/** 이미 입력된 매수/매도 기록(중복 입력 방지용 표시). 단가는 네이티브. */
export interface YearTrade {
  id: string;
  type: "BUY" | "SELL";
  symbol: string;
  name: string;
  quantity: number;
  priceNative: number;
  currency: string;
  date: string;
}

/** 종목 통화 휴리스틱(단건 BUY 와 동일): 6자리=KRW, 그 외=USD. 총액 미리보기용. */
function ccyHeuristic(symbol: string): "KRW" | "USD" {
  return /^\d{6}$/.test(symbol) ? "KRW" : "USD";
}

/**
 * 과거 거래 빠른 입력(인라인) — 화면 이동 없이 한 자리에서.
 * 종목 고르면 매수/매도 + 매수일·단가·수량만 입력, 총액은 자동 계산.
 * 추가해도 폼이 남아 연속 입력(연도별 수기 입력 부담 최소화).
 * 매수 자금은 자동 증자(deposit) — 과거 기록은 매수일=자본투입일(설립 모델).
 */
export function QuickEntryForm({
  accounts,
  year,
  today,
  trades,
}: {
  accounts: Account[];
  year: number;
  today: string;
  /** 이 연도에 이미 입력된 매수/매도 기록(중복 방지용). */
  trades: YearTrade[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [tab, setTab] = useState<"BUY" | "SELL">("BUY");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [selected, setSelected] = useState<{ symbol: string; name: string } | null>(
    null,
  );
  const currentYear = Number(today.slice(0, 4));
  const yearMax = year >= currentYear ? today : `${year}-12-31`;
  const [date, setDate] = useState(`${year}-01-01`);
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<YearTrade | null>(null);

  const priceN = Number(price);
  const qtyN = Number(qty);
  const ccy = selected ? ccyHeuristic(selected.symbol) : "KRW";
  const unit = selected && isCrypto(selected.symbol) ? "개" : "주";
  const total = priceN > 0 && qtyN > 0 ? priceN * qtyN : 0;
  const canSubmit = !!selected && !!accountId && priceN > 0 && qtyN > 0 && !!date;

  function submit() {
    if (!selected || !canSubmit) return;
    setError(null);
    start(async () => {
      const res = await recordEvent({
        type: tab,
        symbol: selected.symbol,
        name: selected.name,
        quantity: qtyN,
        priceOrAmount: priceN,
        date,
        accountId,
        fundingSource: tab === "BUY" ? "deposit" : undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // 같은 종목·날짜로 연속 입력하기 쉽게 단가·수량만 비움.
      setPrice("");
      setQty("");
      router.refresh(); // 서버의 연도별 건수·기존 기록 목록 갱신
    });
  }

  const fieldClass =
    "h-12 w-full rounded-xl border border-input bg-card px-3 text-base outline-none focus:border-primary";

  return (
    <div className="flex flex-col gap-3">
      {/* 이미 입력된 거래(전체 연도) — 중복 입력 방지. 행을 누르면 수정·삭제 모달. */}
      <div className="rounded-xl border border-border p-3">
        <p className="text-xs font-semibold text-muted-foreground">
          이미 입력된 매수·매도 · {trades.length}건
          {trades.length > 0 && (
            <span className="font-normal"> · 누르면 수정·삭제</span>
          )}
        </p>
        {trades.length === 0 ? (
          <p className="mt-1.5 text-xs text-muted-foreground">
            아직 입력된 매수·매도가 없어요. 아래에서 추가하세요.
          </p>
        ) : (
          <ul className="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto">
            {[...trades].reverse().map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setEditing(t)}
                  className="flex w-full items-center gap-2 rounded-lg bg-secondary/60 px-3 py-2 text-left text-sm transition active:scale-[0.99] hover:bg-secondary"
                >
                  <span
                    className={
                      "shrink-0 text-xs font-semibold " +
                      (t.type === "BUY" ? "text-rise" : "text-fall")
                    }
                  >
                    {t.type === "BUY" ? "매수" : "매도"}
                  </span>
                  <span className="truncate font-semibold">{t.name}</span>
                  <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                    {t.quantity.toLocaleString()}
                    {isCrypto(t.symbol) ? "개" : "주"} · @
                    {nativeMoney(t.priceNative, t.currency)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editing && (
        <EditTradeModal
          key={editing.id}
          trade={editing}
          today={today}
          onClose={() => setEditing(null)}
        />
      )}

      {/* 계좌(2개 이상일 때만) */}
      {accounts.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {accounts.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAccountId(a.id)}
              className={
                "rounded-full px-3 py-1.5 text-xs font-semibold " +
                (a.id === accountId
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground")
              }
            >
              {a.name}
            </button>
          ))}
        </div>
      )}

      {/* 매수 / 매도 토글 */}
      <div className="grid grid-cols-2 gap-2">
        {(["BUY", "SELL"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setError(null);
            }}
            className={
              "rounded-xl py-2.5 text-sm font-bold transition " +
              (tab === t
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground")
            }
          >
            {t === "BUY" ? "매수" : "매도"}
          </button>
        ))}
      </div>

      {/* 종목: 미선택이면 검색, 선택되면 칩 + 변경 */}
      {!selected ? (
        <SymbolSearch
          onSelect={(item) => {
            setSelected({ symbol: item.symbol, name: item.name });
            setError(null);
          }}
        />
      ) : (
        <div className="flex items-center gap-3 rounded-xl bg-secondary p-3">
          <Avatar name={selected.name} symbol={selected.symbol} size="md" />
          <span className="flex flex-col">
            <span className="font-bold">{selected.name}</span>
            <span className="text-xs text-muted-foreground">{selected.symbol}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setPrice("");
              setQty("");
            }}
            className="ml-auto text-xs font-semibold text-muted-foreground"
          >
            변경
          </button>
        </div>
      )}

      {/* 날짜·단가·수량 (종목 선택 후) */}
      {selected && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <label className="col-span-3 flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                {tab === "BUY" ? "매수일" : "매도일"}
              </span>
              <input
                type="date"
                min={`${year}-01-01`}
                max={yearMax}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="col-span-2 flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                {tab === "BUY" ? "매수가" : "매도가"} ({ccy === "KRW" ? "원" : "$"})
              </span>
              <input
                inputMode="decimal"
                placeholder="0"
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                className={fieldClass + " tabular-nums"}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">수량</span>
              <input
                inputMode="decimal"
                placeholder="0"
                value={qty}
                onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ""))}
                className={fieldClass + " tabular-nums"}
              />
            </label>
          </div>

          {/* 총액 자동 계산 */}
          <div className="flex items-center justify-between rounded-xl bg-secondary px-4 py-3">
            <span className="text-sm text-muted-foreground">
              {tab === "BUY" ? "매수총액" : "매도총액"} (자동)
            </span>
            <span className="text-lg font-bold tabular-nums">
              {total > 0 ? nativeMoney(total, ccy) : "—"}
            </span>
          </div>

          {tab === "BUY" && (
            <p className="text-xs text-muted-foreground">
              매수액만큼 자동 증자돼요(매수일=투입 원금 반영).
            </p>
          )}

          {error && <p className="text-sm text-rise">{error}</p>}

          <button
            type="button"
            disabled={!canSubmit || pending}
            onClick={submit}
            className="h-13 w-full rounded-xl bg-primary py-4 text-base font-semibold text-primary-foreground transition active:scale-[0.99] disabled:opacity-50"
          >
            {pending ? "기록 중…" : tab === "BUY" ? "매수 추가" : "매도 추가"}
          </button>
        </>
      )}
    </div>
  );
}
