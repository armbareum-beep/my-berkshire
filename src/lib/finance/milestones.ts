/**
 * 회사 연혁 "여정" 마일스톤 — events 에서 파생(새 입력·네트워크 없음).
 *
 * 원칙(③ 정직 · 스타일 중립):
 *  · 통제 가능한 결정·납입만 기념. 시장 운(평가액 상승·종목 급등)은 기념하지 않는다.
 *    → "자산 N 돌파"(시장평가)가 아니라 "투입 자본 N 돌파"(납입)를 쓴다.
 *  · 회전율·종목 수·집중도는 기념하지 않는다(그건 스타일 판단). 해외·배당·규모는
 *    어느 스타일이든 동의하는 객관적 여정 표식.
 * 상세: docs/gamification-honest-roman-v1.md §4(⑥).
 */
import type { InvestmentEvent } from "./valuation";
import { countryOf } from "../securities";
import type { DrawdownEpisode } from "./drawdown";

export interface Milestone {
  date: string; // YYYY-MM-DD
  label: string;
}

/** 투입 자본(납입) 돌파 임계 — 작은 것부터. */
const CAPITAL_MARKS: { amount: number; label: string }[] = [
  { amount: 10_000_000, label: "투입 자본 1천만 돌파" },
  { amount: 50_000_000, label: "투입 자본 5천만 돌파" },
  { amount: 100_000_000, label: "투입 자본 1억 돌파" },
  { amount: 500_000_000, label: "투입 자본 5억 돌파" },
  { amount: 1_000_000_000, label: "투입 자본 10억 돌파" },
];

const earliest = (events: InvestmentEvent[]) =>
  [...events].sort((a, b) => (a.date < b.date ? -1 : 1))[0];

/**
 * 여정 마일스톤(설립·첫 매수는 호출부에서 별도 생성). 날짜 정렬은 호출부 책임.
 */
export function journeyMilestones(
  events: InvestmentEvent[],
  seed: { foundedAt: string; initialValuation: number },
  nameOf: (symbol: string) => string,
): Milestone[] {
  const out: Milestone[] = [];

  // 첫 해외 기업 인수 — 글로벌 투자(중립 스타일)의 여정 표식.
  const firstOverseas = earliest(
    events.filter(
      (e) => e.type === "BUY" && e.symbol && countryOf(e.symbol) !== "한국",
    ),
  );
  if (firstOverseas?.symbol) {
    out.push({
      date: firstOverseas.date,
      label: `첫 해외 기업 인수 · ${nameOf(firstOverseas.symbol)}`,
    });
  }

  // 첫 배당 수령 — 첫 현금흐름(사실).
  const firstDividend = earliest(events.filter((e) => e.type === "DIVIDEND"));
  if (firstDividend) {
    const nm = firstDividend.symbol ? nameOf(firstDividend.symbol) : "";
    out.push({
      date: firstDividend.date,
      label: nm ? `첫 배당 · ${nm}` : "첫 배당 수령",
    });
  }

  // 투입 자본 돌파 — 납입(시드+증자) 기준. 시드로 이미 넘긴 임계는 제외(시작 규모가
  // 아니라 증자로 자라난 것만 기념). WITHDRAWAL 은 이미 일어난 돌파를 되돌리지 않음(역사적 사실).
  const atFounding = new Set(
    CAPITAL_MARKS.filter((m) => seed.initialValuation >= m.amount).map(
      (m) => m.amount,
    ),
  );
  let running = seed.initialValuation;
  const crossedAt = new Map<number, string>();
  const deposits = [...events]
    .filter((e) => e.type === "DEPOSIT")
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const d of deposits) {
    running += d.priceOrAmount;
    for (const m of CAPITAL_MARKS) {
      if (
        !atFounding.has(m.amount) &&
        running >= m.amount &&
        !crossedAt.has(m.amount)
      ) {
        crossedAt.set(m.amount, d.date);
      }
    }
  }
  for (const m of CAPITAL_MARKS) {
    const date = crossedAt.get(m.amount);
    if (date) out.push({ date, label: m.label });
  }

  return out;
}

/**
 * 드로다운 인내 마일스톤 — "통과"(passed)한 에피소드만 연혁에 남긴다.
 * 미회복·도중 매도 에피소드는 어떤 표시도 만들지 않는다(정직 원칙, FR-005·FR-006).
 */
export function drawdownMilestones(episodes: DrawdownEpisode[]): Milestone[] {
  return episodes
    .filter((e) => e.passed)
    .map((e) => ({
      date: e.recoveryDate as string, // passed=true ⇒ recoveryDate≠null
      label: `−${e.bucket}% 하락 구간을 매도 없이 통과`,
    }));
}
