"use client";

import { useState } from "react";
import Link from "next/link";
import { money, type Currency } from "@/lib/format";
import { SymbolAvatar } from "@/components/onboarding/SymbolPicker";
import { CountUp } from "@/components/ui/CountUp";

/** 배당 한 건(확정/예상 공통). 금액은 ₩ 기준 — 표시 통화 환산은 factor 로. */
export interface DivLine {
  symbol: string;
  name: string;
  exDate: string; // YYYY-MM-DD(배당락일)
  month: number; // 1-12
  shares: number;
  dpsNative: number; // 주당 배당금(네이티브 통화)
  currency: string;
  grossKrw: number;
  taxKrw: number;
  estimated: boolean;
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** 두 YYYY-MM-DD 사이 일수(b−a). 시간대 영향 없게 정오 기준. */
function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T12:00:00`).getTime();
  const db = new Date(`${b}T12:00:00`).getTime();
  return Math.round((db - da) / 86_400_000);
}

export function DividendView({
  year,
  minYear,
  maxYear,
  today,
  lines,
  extraUpcoming = [],
  investedKrw,
  factor,
  currency,
}: {
  year: number;
  /** 연도 네비게이터 범위(최초 배당 연도 ~ 올해). */
  minYear: number;
  maxYear: number;
  /** 오늘(YYYY-MM-DD) — 미래/과거 구분 기준. */
  today: string;
  lines: DivLine[];
  /** 하이브리드 — 연 경계를 넘는 임박 예정 배당('받을 예정'에만 추가). */
  extraUpcoming?: DivLine[];
  investedKrw: number;
  /** ₩→표시통화 계수(₩=1, $=1/usdKrw). */
  factor: number;
  currency: Currency;
}) {
  const [net, setNet] = useState(false); // 실수령액(세후) 토글
  const [selMonth, setSelMonth] = useState<number | null>(null); // 막대 탭 선택

  const amountKrw = (l: DivLine) => (net ? l.grossKrw - l.taxKrw : l.grossKrw);
  const disp = (krw: number) => money(krw * factor, currency);

  // 시간 기준 분리 — 배당락일이 오늘 이후면 '받을 예정(미래)', 아니면 '받은(과거)'.
  const isUpcoming = (l: DivLine) => l.exDate >= today;
  const todayMonth = Number(today.slice(5, 7));

  const yearGrossKrw = lines.reduce((s, l) => s + l.grossKrw, 0);
  const yearShownKrw = lines.reduce((s, l) => s + amountKrw(l), 0);
  // 투자배당률 = 연 배당(세전) / 투입원금
  const yieldPct = investedKrw > 0 ? (yearGrossKrw / investedKrw) * 100 : null;

  // 월별 합계 — 받은/받을 예정을 따로 쌓아 한 막대 안에서도 구분.
  const recvByMonth = MONTHS.map((m) =>
    lines
      .filter((l) => l.month === m && !isUpcoming(l))
      .reduce((s, l) => s + amountKrw(l), 0),
  );
  const futByMonth = MONTHS.map((m) =>
    lines
      .filter((l) => l.month === m && isUpcoming(l))
      .reduce((s, l) => s + amountKrw(l), 0),
  );
  const maxMonth = Math.max(
    1,
    ...MONTHS.map((_, i) => recvByMonth[i] + futByMonth[i]),
  );

  // 다가오는 배당(미래) — 가까운 순. 하이브리드 연 경계 임박분 합류.
  const upcoming = [...lines.filter(isUpcoming), ...extraUpcoming].sort((a, b) =>
    a.exDate.localeCompare(b.exDate),
  );
  // 받은 배당(과거) — 최근 월 먼저.
  const past = lines.filter((l) => !isUpcoming(l));
  const pastMonths = MONTHS.filter((m) =>
    past.some((l) => l.month === m),
  ).sort((a, b) => b - a);

  const seg = (krw: number) =>
    krw > 0 ? Math.max(3, (krw / maxMonth) * 100) : 0;

  return (
    <div className="flex flex-col gap-5">
      {/* 헤더 — 연 배당 + 투자배당률 + 실수령 토글 */}
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <div className="flex items-center justify-between">
          {/* 연도 네비게이터 — 과거 이력 열람·연 비교. 범위 밖은 비활성. */}
          <div className="flex items-center gap-0.5">
            {year > minYear ? (
              <Link
                href={`?year=${year - 1}`}
                scroll={false}
                aria-label={`${year - 1}년`}
                className="rounded-full px-1 text-muted-foreground transition active:scale-90 hover:text-foreground"
              >
                ‹
              </Link>
            ) : (
              <span className="px-1 text-border">‹</span>
            )}
            <p className="text-sm font-medium text-muted-foreground tabular-nums">
              {year}년 배당
            </p>
            {year < maxYear ? (
              <Link
                href={`?year=${year + 1}`}
                scroll={false}
                aria-label={`${year + 1}년`}
                className="rounded-full px-1 text-muted-foreground transition active:scale-90 hover:text-foreground"
              >
                ›
              </Link>
            ) : (
              <span className="px-1 text-border">›</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setNet((v) => !v)}
            className={
              "rounded-full px-3 py-1 text-xs font-semibold " +
              (net
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground")
            }
          >
            {net ? "실수령액" : "세전"}
          </button>
        </div>
        <CountUp
          value={yearShownKrw * factor}
          format="money"
          currency={currency}
          className="mt-1 block text-3xl font-extrabold tracking-tight"
        />
        {yieldPct != null && (
          <p className="mt-1 text-sm text-muted-foreground">
            투자배당률 {yieldPct.toFixed(2)}%
          </p>
        )}

        {/* 월별 막대 — 받은(진한·아래) 위에 받을 예정(옅은·위)을 쌓아 시간 구분.
            탭하면 아래 슬롯에 그 달 금액 표시. */}
        <div className="mt-5 flex h-28 items-end gap-1">
          {MONTHS.map((m, i) => {
            const recvH = seg(recvByMonth[i]);
            const futH = seg(futByMonth[i]);
            const isNow = m === todayMonth;
            const isSel = m === selMonth;
            return (
              <button
                key={m}
                type="button"
                aria-pressed={isSel}
                onClick={() => setSelMonth((v) => (v === m ? null : m))}
                className={
                  "flex h-full flex-1 flex-col items-center justify-end gap-1 rounded-md transition active:scale-95 " +
                  (selMonth != null && !isSel ? "opacity-40" : "")
                }
              >
                <div className="flex w-full flex-1 flex-col justify-end gap-px">
                  {futH > 0 && (
                    <div
                      className="w-full rounded-t-sm bg-primary/30"
                      style={{ height: `${futH}%` }}
                    />
                  )}
                  {recvH > 0 && (
                    <div
                      className={
                        "w-full bg-primary " + (futH > 0 ? "" : "rounded-t-sm")
                      }
                      style={{ height: `${recvH}%` }}
                    />
                  )}
                </div>
                <span
                  className={
                    "text-[10px] " +
                    (isSel
                      ? "font-bold text-primary"
                      : isNow
                        ? "font-bold text-foreground"
                        : "text-muted-foreground")
                  }
                >
                  {m}
                </span>
              </button>
            );
          })}
        </div>
        {/* 읽기 슬롯 — 기본은 범례, 막대 탭 시 그 달 내역(레이아웃 시프트 없게 고정 높이). */}
        <div className="mt-2 min-h-[1.25rem] text-xs">
          {selMonth == null ? (
            <p className="flex items-center gap-3 text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-sm bg-primary" /> 받은 배당
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-sm bg-primary/30" /> 받을 예정(추정)
              </span>
            </p>
          ) : (
            (() => {
              const recv = recvByMonth[selMonth - 1];
              const fut = futByMonth[selMonth - 1];
              const parts: string[] = [];
              if (recv > 0) parts.push(`받은 ${disp(recv)}`);
              if (fut > 0) parts.push(`받을 예정 ${disp(fut)}`);
              return (
                <p className="tabular-nums text-foreground">
                  <span className="font-bold">{selMonth}월</span>
                  {parts.length === 0 ? (
                    <span className="text-muted-foreground"> · 배당 없음</span>
                  ) : (
                    <>
                      <span className="text-muted-foreground">
                        {" · "}
                        {parts.join(" · ")}
                      </span>
                      {recv > 0 && fut > 0 && (
                        <span className="ml-1 font-semibold">
                          · 합계 {disp(recv + fut)}
                        </span>
                      )}
                    </>
                  )}
                </p>
              );
            })()
          )}
        </div>
      </section>

      {/* 다가오는 배당(미래) — 가까운 순, D-day 강조. */}
      {upcoming.length > 0 && (
        <section className="rounded-2xl bg-card p-5 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-base font-extrabold">받을 예정</p>
            <p className="text-base font-bold tabular-nums">
              {disp(upcoming.reduce((s, l) => s + amountKrw(l), 0))}
            </p>
          </div>
          <ul className="flex flex-col gap-3">
            {upcoming.map((l, i) => {
              const d = daysBetween(today, l.exDate);
              const dday = d <= 0 ? "오늘" : `D-${d}`;
              return (
                <DivRow
                  key={`u${i}`}
                  l={l}
                  viewYear={year}
                  amount={disp(amountKrw(l))}
                  badge={
                    <span className="ml-1.5 rounded-full bg-accent px-1.5 py-0.5 align-middle text-[10px] font-bold text-accent-foreground">
                      {dday}
                    </span>
                  }
                />
              );
            })}
          </ul>
        </section>
      )}

      {/* 받은 배당(과거) — 최근 월 먼저. */}
      {past.length > 0 && (
        <>
          <p className="-mb-1 px-1 text-sm font-semibold text-muted-foreground">
            받은 배당
          </p>
          {pastMonths.map((m) => {
            const items = past
              .filter((l) => l.month === m)
              .sort((a, b) => b.exDate.localeCompare(a.exDate));
            const monthSum = items.reduce((s, l) => s + amountKrw(l), 0);
            return (
              <section key={m} className="rounded-2xl bg-card p-5 shadow-card">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-base font-extrabold">{m}월</p>
                  <p className="text-base font-bold tabular-nums">
                    {disp(monthSum)}
                  </p>
                </div>
                <ul className="flex flex-col gap-3">
                  {items.map((l, i) => (
                    <DivRow
                      key={`p${i}`}
                      l={l}
                      viewYear={year}
                      amount={disp(amountKrw(l))}
                      badge={
                        l.estimated ? (
                          <span className="ml-1.5 rounded-full bg-secondary px-1.5 py-0.5 align-middle text-[10px] font-semibold text-muted-foreground">
                            예상
                          </span>
                        ) : null
                      }
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}

      {lines.length === 0 && (
        <div className="rounded-2xl bg-card p-6 text-center shadow-card">
          <p className="text-sm text-muted-foreground">
            올해 받은·예상 배당이 없습니다. 배당주를 보유하면 자동으로 채워져요.
          </p>
        </div>
      )}
    </div>
  );
}

/** 배당 한 줄 — 아바타 · 종목(+뱃지) · 주수/DPS/배당락 · 금액.
 *  배당락이 보는 연도와 다르면(하이브리드 연 경계분) 연·월·일 전체 표시. */
function DivRow({
  l,
  amount,
  badge,
  viewYear,
}: {
  l: DivLine;
  amount: string;
  badge: React.ReactNode;
  viewYear: number;
}) {
  const exDateStr =
    Number(l.exDate.slice(0, 4)) !== viewYear
      ? l.exDate.replace(/-/g, ".")
      : l.exDate.slice(5).replace("-", "/");
  return (
    <li className="flex items-center gap-3">
      <SymbolAvatar name={l.name} symbol={l.symbol} size="md" />
      <span className="flex flex-col">
        <span className="font-bold">
          {l.name}
          {badge}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {l.shares.toLocaleString()}주 · 1주당{" "}
          {l.currency === "KRW"
            ? `₩${Math.round(l.dpsNative).toLocaleString()}`
            : `${l.dpsNative.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${l.currency}`}{" "}
          · 배당락 {exDateStr}
        </span>
      </span>
      <span className="ml-auto font-semibold tabular-nums">{amount}</span>
    </li>
  );
}
