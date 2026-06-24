/**
 * 복리 무중단 지표 — "소비성 자본인출 없이 복리를 지켜온 연속 기간".
 *
 * 멍거 제1원칙: 복리는 *필요 없이 중단하지 마라*. 복리를 끊는 것은 자본을
 * '드는 것(현금 보유)'이 아니라 자본을 '빼서 소비하는 것'(WITHDRAWAL)이다.
 *  · 현금 보유·매매·계좌 간 이동·배당 인출 → 끊김 아님(자본은 기계 안에 남음).
 *  · 소비성 자본인출(WITHDRAWAL, 일별 순유출) → 끊김(그 시점부터 0 재시작).
 *
 * 새 저장 없이 events + 설립자본에서 결정적으로 파생. 시세·현금비중과 무관.
 */
import { todayKST } from "../date";
import type { InvestmentEvent } from "./valuation";

/** 설립 정보 — 설립일이 최초 자본 투입일(설립자본 시드). */
export interface CapitalFounding {
  foundedAt: string; // YYYY-MM-DD
  initialValuation: number; // 설립자본 ₩
}

export interface CompoundingStreak {
  /** 무중단 시작일(YYYY-MM-DD). 최초 자본 투입일 또는 마지막 끊김일. 빈 장부면 null. */
  startDate: string | null;
  /** startDate ~ today 경과 일수(>=0). */
  days: number;
  /** 완료 개월 수(달력 기준). */
  months: number;
  /** 표시 단위 — 1개월 미만이면 'day', 이상이면 'month'. */
  unit: "day" | "month";
  /** 최근 30일 내 추가 자본 투입(증자) 존재 → 🔥. */
  bonusRecentDeposit: boolean;
  /** (상세) 과거 끊김 시점들(소비성 인출). 결산에서 노출. */
  breaks: { date: string }[];
  /** (상세) 추가 투입 이력(증자). 결산에서 노출. */
  deposits: { date: string }[];
  /** 자본 투입 전 빈 장부 → 중립 빈 상태. */
  isEmpty: boolean;
}

const DAY_MS = 86_400_000;
const BONUS_WINDOW_DAYS = 30;

/** UTC 자정 기준 일수 차(음수는 0으로 클램프). */
function diffDays(from: string, to: string): number {
  const d = Math.floor(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS,
  );
  return d < 0 ? 0 : d;
}

/** 완료 개월 수(달력 기준). 오늘 '일'이 시작 '일'보다 작으면 한 달 미완으로 차감. */
function monthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  let m = (ty - fy) * 12 + (tm - fm);
  if (td < fd) m -= 1;
  return m < 0 ? 0 : m;
}

const EMPTY: CompoundingStreak = {
  startDate: null,
  days: 0,
  months: 0,
  unit: "day",
  bonusRecentDeposit: false,
  breaks: [],
  deposits: [],
  isEmpty: true,
};

/**
 * 복리 무중단 상태 계산.
 * @param events 거래 원장(자본 흐름은 DEPOSIT/WITHDRAWAL만 사용).
 * @param founding 설립일·설립자본(최초 자본 투입).
 * @param today 기준 '오늘'(기본 KST). 테스트는 고정값 주입.
 */
export function computeCompoundingStreak(
  events: InvestmentEvent[],
  founding: CapitalFounding,
  today: string = todayKST(),
): CompoundingStreak {
  // 자본 흐름만 추출(배당·매매·환전·계좌이동은 무시).
  const deposits = events
    .filter((e) => e.type === "DEPOSIT")
    .map((e) => ({ date: e.date, amount: e.priceOrAmount }));
  const withdrawals = events
    .filter((e) => e.type === "WITHDRAWAL")
    .map((e) => ({ date: e.date, amount: e.priceOrAmount }));

  const hasFounding = founding.initialValuation > 0;
  if (!hasFounding && deposits.length === 0) return { ...EMPTY };

  // 일별 순 자본흐름 = 설립자본(설립일) + 증자 − 인출.
  const netByDate = new Map<string, number>();
  const add = (date: string, amt: number) =>
    netByDate.set(date, (netByDate.get(date) ?? 0) + amt);
  if (hasFounding) add(founding.foundedAt, founding.initialValuation);
  for (const d of deposits) add(d.date, d.amount);
  for (const w of withdrawals) add(w.date, -w.amount);

  const dates = [...netByDate.keys()].sort();
  // 끊김일 = 그날 자본 순흐름이 음수(소비성 순유출)인 날.
  const breakDates = dates.filter((d) => (netByDate.get(d) as number) < 0);

  // 최초 자본 투입일 = 설립일(설립자본>0) 또는 첫 양(+) 순흐름 날.
  const firstInjection = hasFounding
    ? founding.foundedAt
    : (dates.find((d) => (netByDate.get(d) as number) > 0) ?? dates[0]);

  // 시작일 = 마지막 끊김일(최초 투입 이후) else 최초 자본 투입일.
  const lastBreak = breakDates.length
    ? breakDates[breakDates.length - 1]
    : null;
  const startDate =
    lastBreak && lastBreak > firstInjection ? lastBreak : firstInjection;

  const days = diffDays(startDate, today);
  const months = monthsBetween(startDate, today);
  const unit: "day" | "month" = months >= 1 ? "month" : "day";

  const bonusRecentDeposit = deposits.some(
    (d) => d.date <= today && diffDays(d.date, today) <= BONUS_WINDOW_DAYS,
  );

  return {
    startDate,
    days,
    months,
    unit,
    bonusRecentDeposit,
    breaks: breakDates.map((date) => ({ date })),
    deposits: deposits
      .map((d) => ({ date: d.date }))
      .sort((a, b) => (a.date < b.date ? -1 : 1)),
    isEmpty: false,
  };
}
