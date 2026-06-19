/**
 * 홈 재방문 후크 — 토스식 알림 큐의 신호 해석기.
 *
 * 새 데이터 없이 기존 소스에서 파생(공시 피드·배당 이벤트·관심종목 시세·분기 경계).
 * 우선순위로 정렬한 배열을 반환하고, 배너(클라)는 [0]을 보여준 뒤 "확인"하면 다음으로 넘긴다.
 * 확인(디스미스)된 key 는 제외 — key 는 날짜·접수번호·분기 스코프라 자연 만료.
 *
 * 원칙: 티 안 나게 · 매매 유도 금지 · 단정 아니라 환기(§11). 후보 없으면 빈 배열(평소 비표시).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import type { InvestmentEvent } from "./valuation";
import { getDisclosuresForSymbols } from "./dart";
import { getPrices } from "./prices";
import { isQuoteOnly } from "./quotes";
import { daysSince } from "./xirr";
import { signedPct, money } from "../format";

const RECENT_DAYS = 7; // 공시·배당 "최근" 창
const MOVER_PCT = 0.05; // 관심종목 변동 임계(±5%)
const MAX_SIGNALS = 5; // 큐 캡

export interface HomeSignal {
  key: string;
  icon: string;
  text: string;
  href: string;
  tone: "warn" | "good" | "info";
  /** 정렬용 날짜(YYYY-MM-DD). 최신순(내림차순) 정렬에 쓰고, 없으면 맨 뒤로 간다. */
  at?: string;
}

/** 신호 정렬 비교자 — 최신순(at 내림차순, 없으면 맨 뒤). */
export function byRecency(a: HomeSignal, b: HomeSignal): number {
  return (b.at ?? "").localeCompare(a.at ?? "");
}

export interface ResolveSignalsOpts {
  events: InvestmentEvent[];
  heldSymbols: string[];
  watchSymbols: string[];
  /** 종목코드 → 이름(보유 + 관심 병합). 없으면 코드 표시. */
  names: Record<string, string>;
  today: string;
  quarterLabel: string;
  dismissed: Set<string>;
}

/** YYYY-MM-DD 에 일수 가감. */
function shiftDate(d: string, days: number): string {
  const t = new Date(`${d}T00:00:00Z`).getTime() + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** 정기·실적성 공시(재무 업데이트 신호)만 — 그 외 info 공시(IR·주총 등)는 노이즈라 제외. */
const PERIODIC_RE = /사업보고서|분기보고서|반기보고서|잠정|영업실적|손익구조/;

/**
 * 홈 신호 후보를 우선순위로 정렬해 반환(디스미스 제외, 최대 MAX_SIGNALS).
 * 공시·시세는 병렬 수집. 모두 캐시(DART 6h·야후 60s) — 홈 지연 최소.
 */
export async function resolveHomeSignals(
  opts: ResolveSignalsOpts,
): Promise<HomeSignal[]> {
  const { events, heldSymbols, watchSymbols, names, today, quarterLabel } = opts;
  const nameOf = (s: string) => names[s] ?? s;

  const fromDate = shiftDate(today, -RECENT_DAYS);
  const watchTradable = watchSymbols; // 시세 조회는 전부, href만 분기

  const [disclosures, quotes] = await Promise.all([
    heldSymbols.length
      ? getDisclosuresForSymbols(heldSymbols, fromDate, today, 3, 8)
      : Promise.resolve([]),
    watchTradable.length
      ? getPrices(watchTradable)
      : Promise.resolve(null),
  ]);

  const out: HomeSignal[] = [];

  // 1) 경고성 공시(최상위) — 리스크는 즉시 환기.
  for (const d of disclosures) {
    if (d.hint?.tone === "warn") {
      out.push({
        key: `disc:${d.rceptNo}`,
        icon: "⚠️",
        text: `${d.corpName} · ${d.title}`,
        href: `/stocks/${d.stockCode}`,
        tone: "warn",
        at: d.date,
      });
    }
  }

  // 2) 배당 도착 — 최근 7일 내 받은 배당(확정·긍정).
  for (const e of events) {
    if (e.type !== "DIVIDEND" || !e.symbol) continue;
    const ago = daysSince(e.date, today);
    if (ago < 0 || ago > RECENT_DAYS) continue;
    const net = e.priceOrAmount - e.feeAndTax;
    out.push({
      key: `div:${e.date}:${e.symbol}`,
      icon: "💰",
      text: `${nameOf(e.symbol)} 배당 ${money(net, "KRW")} 들어왔어요`,
      href: "/returns",
      tone: "good",
      at: e.date,
    });
  }

  // 3) 정기·실적 공시 — "재무가 업데이트됐어요"(보러 오게).
  for (const d of disclosures) {
    if (d.hint?.tone !== "warn" && PERIODIC_RE.test(d.title)) {
      out.push({
        key: `disc:${d.rceptNo}`,
        icon: "🧾",
        text: `${d.corpName} · ${d.title}`,
        href: `/stocks/${d.stockCode}`,
        tone: "info",
        at: d.date,
      });
    }
  }

  // 4) 새 분기 리포트 — 이번 분기 리포트 미열람 시(열람·확인하면 report:{분기} 디스미스).
  if (events.length > 0) {
    out.push({
      key: `report:${quarterLabel}`,
      icon: "🧾",
      text: `${quarterLabel} 경영 리포트가 준비됐어요`,
      href: "/report",
      tone: "info",
      at: today,
    });
  }

  // 5) 관심종목 변동(최하위) — 오늘 |변동%| ≥ 5% 중 가장 큰 1개. 중립 문구.
  if (quotes) {
    let top: { symbol: string; rate: number } | null = null;
    for (const s of watchTradable) {
      const px = quotes.prices[s];
      const prev = quotes.previousCloses[s];
      if (px == null || prev == null || prev <= 0) continue;
      const rate = (px - prev) / prev;
      if (Math.abs(rate) < MOVER_PCT) continue;
      if (!top || Math.abs(rate) > Math.abs(top.rate)) top = { symbol: s, rate };
    }
    if (top) {
      const quoteOnly = isQuoteOnly(top.symbol, quotes.instrumentTypes[top.symbol]);
      out.push({
        key: `mover:${top.symbol}:${today}`,
        icon: "⭐",
        text: `${nameOf(top.symbol)} 오늘 ${signedPct(top.rate)}`,
        href: quoteOnly ? "/search" : `/stocks/${top.symbol}`,
        tone: "info",
        at: today,
      });
    }
  }

  // 디스미스 제외 + 중복 key 제거(공시가 1·3 둘 다 안 잡히게는 했지만 방어적).
  const seen = new Set<string>();
  const deduped: HomeSignal[] = [];
  for (const sig of out) {
    if (opts.dismissed.has(sig.key) || seen.has(sig.key)) continue;
    seen.add(sig.key);
    deduped.push(sig);
  }
  // 최신순 정렬 후 캡 — 우선순위(경고 먼저)가 아니라 날짜 내림차순(사용자 선호).
  deduped.sort(byRecency);
  return deduped.slice(0, MAX_SIGNALS);
}

/** 확인(디스미스)된 신호 key 집합. 다음 로드에 서버측 제외 동기화용. */
export async function loadDismissed(
  supabase: SupabaseClient<Database>,
  holdingId: string,
): Promise<Set<string>> {
  const { data } = await supabase
    .from("home_signal_dismissals")
    .select("signal_key")
    .eq("holding_id", holdingId);
  return new Set((data ?? []).map((r) => r.signal_key));
}
