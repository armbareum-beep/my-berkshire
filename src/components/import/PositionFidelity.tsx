"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Lock, Trash2 } from "lucide-react";
import {
  reconstructPosition,
  declareFounding,
  type ReconstructTrade,
} from "@/app/import/actions";
import { isCrypto } from "@/lib/securities";
import { signedPct, signedWon } from "@/lib/format";
import { Avatar } from "@/components/ui/Avatar";
import { WeightBar } from "@/components/ui/WeightBar";
import { SuccessOverlay } from "@/components/transactions/wizard/SuccessOverlay";

export interface PositionInfo {
  symbol: string;
  name: string;
  /** 맞춰야 할 목표 수량 — T0=스냅샷이 주장한 보유, T1=현재 보유. */
  target: number;
  /** 실제로 입력(저장)된 매매의 순수량(스테이징 전엔 0). */
  realNet: number;
  tier: "T0" | "T1" | "T2";
  reconciled: boolean;
}

const TOL = 1e-9;

type CartRow = ReconstructTrade;

/**
 * 종목별 정밀도(연혁 복원) — 스냅샷을 실제 매매로 교체.
 * 실제 매매는 "화면 안 카트"에만 모았다가 "복원 완료" 한 번에 저장+스냅샷 삭제 → 일시적 이중계상 없음.
 * 수량이 스냅샷 보유와 같아야 커밋되며, 평단가는 실제 기록으로 정확히 교체된다.
 */
interface Preview {
  status: string;
  xirr: number | null;
  cumulativeReturn: number | null;
}

export function PositionFidelity({
  holdingId,
  positions,
  today,
  companyAgeDays,
  trust,
  foundedAt,
  foundingDeclared,
  remaining,
  preview,
  realizedKrw,
  realizedUnlocked,
}: {
  holdingId: string;
  positions: PositionInfo[];
  today: string;
  companyAgeDays: number;
  trust: number;
  foundedAt: string;
  foundingDeclared: boolean;
  remaining: number;
  preview: Preview;
  realizedKrw: number;
  realizedUnlocked: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [openSymbol, setOpenSymbol] = useState<string | null>(null);
  const [cart, setCart] = useState<CartRow[]>([]);
  const [form, setForm] = useState({ type: "BUY" as "BUY" | "SELL", date: today, qty: "", price: "" });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ title: string; sub?: string } | null>(null);

  if (positions.length === 0) return null;

  const reconstructed = positions.filter((p) => p.tier === "T1").length;
  const unitOf = (sym: string) => (isCrypto(sym) ? "개" : "주");
  const fmt = (n: number) =>
    Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 8 });
  const cartNet = cart.reduce((s, t) => s + (t.type === "BUY" ? t.quantity : -t.quantity), 0);

  const xirrReady = preview.status === "xirr" && preview.xirr != null;

  const ageLabel = (() => {
    const d = Math.max(0, companyAgeDays);
    const y = Math.floor(d / 365);
    const m = Math.floor((d % 365) / 30);
    if (y > 0) return `${y}년 ${m}개월`;
    if (m > 0) return `${m}개월`;
    return `${d}일`;
  })();

  function toggleDeclare(next: boolean) {
    setError(null);
    start(async () => {
      const res = await declareFounding(holdingId, next);
      if (!res.ok) {
        setError(res.error ?? "설립 확정 처리에 실패했어요.");
        return;
      }
      if (next) setDone({ title: "설립 확정", sub: "연혁 복원을 마무리했어요" });
      else router.refresh();
    });
  }

  function openFor(symbol: string) {
    setOpenSymbol(symbol);
    setCart([]);
    setForm({ type: "BUY", date: today, qty: "", price: "" });
    setError(null);
  }

  function addTrade() {
    const qty = Number(form.qty);
    const price = Number(form.price);
    if (!(qty > 0) || !(price > 0) || !form.date) return;
    setCart((c) => [...c, { type: form.type, date: form.date, quantity: qty, price }]);
    setForm((f) => ({ ...f, qty: "", price: "" }));
  }

  function commit(p: PositionInfo) {
    setError(null);
    start(async () => {
      const res = await reconstructPosition(holdingId, p.symbol, cart);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone({ title: `${p.name} 복원 완료`, sub: res.note ?? "스냅샷을 실제 기록으로 교체했어요" });
    });
  }

  if (done) {
    return (
      <SuccessOverlay
        title={done.title}
        sub={done.sub}
        onContinue={() => {
          setDone(null);
          setOpenSymbol(null);
          setCart([]);
          router.refresh();
        }}
      />
    );
  }

  const fieldClass =
    "h-10 rounded-lg border border-input bg-card px-2 text-sm outline-none focus:border-primary";

  return (
    <section className="rounded-2xl bg-card p-4 shadow-card">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="font-bold">종목별 정밀도</h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          복원 {reconstructed}/{positions.length}
        </span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        실제 매매를 넣어 스냅샷(대충 평단)을 진짜 기록으로 교체해요. 수량을 맞추고 복원하면 평단가가 정확해집니다.
      </p>

      {/* 트랙레코드(회사 나이) */}
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm font-semibold">
          트랙레코드 <span className="text-primary">{ageLabel}</span>
        </span>
        <span className="text-xs text-muted-foreground">{foundedAt}부터</span>
      </div>

      {/* 정밀도 미터 */}
      <div className="mb-3">
        <WeightBar weight={trust} />
        <p className="mt-1 text-xs text-muted-foreground">
          정밀도 · {reconstructed}/{reconstructed + remaining} 종목 복원
        </p>
      </div>

      {/* 수익률: 누적은 항상(평단 맞으면 정확), 연환산(XIRR)은 '언제 샀는지' 넣어야 정확 */}
      <div className="mb-3 rounded-xl bg-secondary/50 p-3">
        <Link href="/returns" className="flex items-center justify-between">
          <span className="text-sm font-semibold">누적수익률</span>
          <span className="text-base font-bold tabular-nums">
            {preview.cumulativeReturn != null ? signedPct(preview.cumulativeReturn) : "—"}
          </span>
        </Link>
        <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            {!xirrReady && <Lock size={13} />} 연환산(XIRR)
          </span>
          {xirrReady ? (
            <span className="text-base font-bold tabular-nums">{signedPct(preview.xirr!)}</span>
          ) : (
            <span className="select-none text-base font-bold tabular-nums blur-sm">••.•%</span>
          )}
        </div>
        {!xirrReady && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {remaining > 0
              ? "언제 샀는지(실제 매매)를 넣으면 연환산 수익률이 정확해져요."
              : "기간이 더 쌓이면 연환산이 표시돼요."}
          </p>
        )}
      </div>

      {/* 실현손익 프리뷰(매도가 있으면 공개) */}
      <div className="mb-3 rounded-xl bg-secondary/50 p-3">
        {realizedUnlocked ? (
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">실현손익</span>
            <span
              className="text-base font-bold tabular-nums"
              style={{ color: realizedKrw >= 0 ? "var(--rise)" : "var(--fall)" }}
            >
              {signedWon(realizedKrw)}
            </span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                <Lock size={13} /> 실현손익
              </span>
              <span className="select-none text-base font-bold tabular-nums blur-sm">
                ₩••••
              </span>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              이미 판 종목이나 일부 매도를 아래 연도에서 넣으면 실현손익이 계산돼요.
            </p>
          </>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {positions.map((p) => {
          const isOpen = openSymbol === p.symbol;
          const matched = isOpen && Math.abs(cartNet - p.target) < TOL && cart.length > 0;
          return (
            <li key={p.symbol} className="rounded-xl bg-secondary/50 p-3">
              <div className="flex items-center gap-3">
                <Avatar name={p.name} symbol={p.symbol} size="md" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-bold">{p.name}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {isOpen ? `입력 ${fmt(cartNet)}${unitOf(p.symbol)} ↔ ` : ""}보유 {fmt(p.target)}
                    {unitOf(p.symbol)}
                  </span>
                </span>
                <span className="ml-auto shrink-0">
                  {p.tier === "T1" ? (
                    <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                      <Check size={12} strokeWidth={3} /> 복원완료
                    </span>
                  ) : p.tier === "T2" ? (
                    <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                      매도완료
                    </span>
                  ) : isOpen ? (
                    <button
                      type="button"
                      onClick={() => setOpenSymbol(null)}
                      className="text-xs font-semibold text-muted-foreground"
                    >
                      닫기
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openFor(p.symbol)}
                      className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-muted-foreground"
                    >
                      <Lock size={11} /> 복원하기
                    </button>
                  )}
                </span>
              </div>

              {isOpen && p.tier === "T0" && (
                <div className="mt-3 flex flex-col gap-2">
                  {/* 카트(저장 전, 화면에만 보관) */}
                  {cart.length > 0 && (
                    <ul className="flex flex-col gap-1">
                      {cart.map((t, i) => (
                        <li
                          key={i}
                          className="flex items-center gap-2 rounded-lg bg-card px-2.5 py-1.5 text-xs"
                        >
                          <span className={t.type === "BUY" ? "text-rise" : "text-fall"}>
                            {t.type === "BUY" ? "매수" : "매도"}
                          </span>
                          <span className="tabular-nums text-muted-foreground">{t.date}</span>
                          <span className="ml-auto tabular-nums">
                            {fmt(t.quantity)}
                            {unitOf(p.symbol)} · @{t.price.toLocaleString()}
                          </span>
                          <button
                            type="button"
                            onClick={() => setCart((c) => c.filter((_, j) => j !== i))}
                            aria-label="삭제"
                            className="text-muted-foreground"
                          >
                            <Trash2 size={13} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* 거래 추가 줄 */}
                  <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-2">
                    <div className="grid grid-cols-2 gap-1.5">
                      {(["BUY", "SELL"] as const).map((tp) => (
                        <button
                          key={tp}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, type: tp }))}
                          className={
                            "rounded-lg py-1.5 text-xs font-bold " +
                            (form.type === tp
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-secondary-foreground")
                          }
                        >
                          {tp === "BUY" ? "매수" : "매도"}
                        </button>
                      ))}
                    </div>
                    <input
                      type="date"
                      max={today}
                      value={form.date}
                      onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                      className={fieldClass}
                    />
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        inputMode="decimal"
                        placeholder="단가"
                        value={form.price}
                        onChange={(e) => setForm((f) => ({ ...f, price: e.target.value.replace(/[^0-9.]/g, "") }))}
                        className={fieldClass + " tabular-nums"}
                      />
                      <input
                        inputMode="decimal"
                        placeholder="수량"
                        value={form.qty}
                        onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value.replace(/[^0-9.]/g, "") }))}
                        className={fieldClass + " tabular-nums"}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={addTrade}
                      disabled={!(Number(form.qty) > 0 && Number(form.price) > 0 && !!form.date)}
                      className="rounded-lg bg-secondary py-1.5 text-xs font-semibold text-secondary-foreground disabled:opacity-50"
                    >
                      + 거래 담기
                    </button>
                  </div>

                  {error && <p className="text-xs text-rise">{error}</p>}

                  <button
                    type="button"
                    disabled={!matched || pending}
                    onClick={() => commit(p)}
                    className="h-11 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition active:scale-[0.99] disabled:opacity-50"
                  >
                    {pending
                      ? "복원 중…"
                      : matched
                        ? "복원 완료"
                        : `수량을 맞춰주세요 (${fmt(cartNet)}/${fmt(p.target)})`}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* 설립 확정(첫 거래 선언) */}
      <div className="mt-4 border-t border-border pt-3">
        {foundingDeclared ? (
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-primary">
              <Check size={14} strokeWidth={3} /> 설립 확정됨
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => toggleDeclare(false)}
              className="text-xs text-muted-foreground disabled:opacity-50"
            >
              되돌리기
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => toggleDeclare(true)}
            className="w-full rounded-xl border border-border py-2.5 text-sm font-semibold transition active:scale-[0.99] disabled:opacity-50"
          >
            이게 내 첫 거래예요 · 설립 확정
          </button>
        )}
        <p className="mt-2 text-center text-xs text-muted-foreground">
          더 과거 거래가 없다면 확정하세요. 나중에 더 이른 거래를 넣으면 자동 해제돼요.
        </p>
      </div>
    </section>
  );
}
