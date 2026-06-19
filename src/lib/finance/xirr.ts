/**
 * XIRR 엔진 — /docs/xirr-spec-v1.md 의 단일 진실원본 구현.
 *
 * 규칙: 외부 금융 라이브러리 금지(직접 구현). 비즈니스 로직만 — UI 의존 없음.
 *
 * 현금흐름 정의(명세 1):
 *  · 설립 등기 평가액(initial_valuation @ founded_at): 음수(−)
 *  · 입금(DEPOSIT): 음수(−)
 *  · 출금(WITHDRAWAL): 양수(+)
 *  · 오늘의 총 평가액(terminal value): 양수(+)
 *  · 배당·매수·매도는 현금흐름에 직접 넣지 않는다(평가액=현금잔고 통해 반영, 이중계산 방지).
 */

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365;

export interface Flow {
  date: string | Date; // YYYY-MM-DD 또는 Date
  amount: number; // 부호 포함
}

/** 날짜를 UTC 자정 ms로 정규화(시간대/시각 잡음 제거). */
function toMs(d: string | Date): number {
  if (d instanceof Date) {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  // "YYYY-MM-DD" 가정
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}

/** tᵢ = (dateᵢ − t0) / 365 (연 단위). t0 = 최초(최소) 날짜 = 설립일. */
function yearsFrom(t0Ms: number, dateMs: number): number {
  return (dateMs - t0Ms) / MS_PER_DAY / DAYS_PER_YEAR;
}

/** NPV(r) = Σ amountᵢ / (1+r)^tᵢ */
function npv(rate: number, times: number[], amounts: number[]): number {
  let sum = 0;
  for (let i = 0; i < times.length; i++) {
    sum += amounts[i] / Math.pow(1 + rate, times[i]);
  }
  return sum;
}

/** NPV'(r) = Σ −tᵢ·amountᵢ / (1+r)^(tᵢ+1) */
function dNpv(rate: number, times: number[], amounts: number[]): number {
  let sum = 0;
  for (let i = 0; i < times.length; i++) {
    sum += (-times[i] * amounts[i]) / Math.pow(1 + rate, times[i] + 1);
  }
  return sum;
}

/**
 * XIRR — Newton-Raphson 우선, 실패 시 Bisection 폴백(명세 3).
 * 양수·음수 흐름이 모두 없으면 해가 없으므로 null.
 */
export function xirr(flows: Flow[]): number | null {
  if (flows.length < 2) return null;

  const hasPos = flows.some((f) => f.amount > 0);
  const hasNeg = flows.some((f) => f.amount < 0);
  if (!hasPos || !hasNeg) return null; // 해 없음

  const t0 = Math.min(...flows.map((f) => toMs(f.date)));
  const times = flows.map((f) => yearsFrom(t0, toMs(f.date)));
  const amounts = flows.map((f) => f.amount);

  // ── 1차: Newton-Raphson ──
  let r = 0.1; // 초기 추정치 10%
  for (let iter = 0; iter < 100; iter++) {
    const value = npv(r, times, amounts);
    const deriv = dNpv(r, times, amounts);
    if (Math.abs(deriv) < 1e-12) break; // 발산 방지 → bisection
    let rNext = r - value / deriv;
    if (rNext <= -0.999) rNext = (r - 0.999) / 2; // 정의역 보호
    if (Math.abs(rNext - r) < 1e-9) return rNext; // 수렴
    r = rNext;
  }

  // ── 2차 폴백: Bisection (느리지만 절대 실패 안 함) ──
  let lo = -0.999;
  let hi = 10.0; // 연 −99.9% ~ +1000%
  const npvLo = npv(lo, times, amounts);
  const npvHi = npv(hi, times, amounts);
  if (npvLo * npvHi > 0) return null; // 구간 내 해 없음

  let mid = (lo + hi) / 2;
  for (let iter = 0; iter < 200; iter++) {
    mid = (lo + hi) / 2;
    const npvMid = npv(mid, times, amounts);
    if (Math.abs(npvMid) < 1e-9) return mid;
    if (npv(lo, times, amounts) * npvMid < 0) hi = mid;
    else lo = mid;
  }
  return mid;
}

/** 경과 일수(설립일 → 오늘). */
export function daysSince(foundedAt: string | Date, today: string | Date): number {
  return Math.floor((toMs(today) - toMs(foundedAt)) / MS_PER_DAY);
}
