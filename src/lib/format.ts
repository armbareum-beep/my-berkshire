/** 표시용 포맷 헬퍼 — 모든 수치 tabular-nums 와 함께 사용. */

export type Currency = "KRW" | "USD";

export function won(n: number): string {
  return `₩${Math.round(n).toLocaleString()}`;
}

/** 통화 인식 금액 포맷. KRW=₩(정수), USD=$(소수 2자리). */
export function money(n: number, currency: Currency = "KRW"): string {
  if (currency === "USD")
    return `$${n.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  return won(n);
}

export function signedMoney(n: number, currency: Currency = "KRW"): string {
  return `${n >= 0 ? "+" : "-"}${money(Math.abs(n), currency)}`;
}

/**
 * 부호 + 짧은 금액(목록 손익용). KRW: ≥1억 "억", ≥1만 "만"(≥100만은 정수), 그 외 일반.
 * USD: $K/M 압축. wonCompact(억/조 전용)과 달리 만 단위까지 줄여 행이 길어지지 않게.
 * 예: +611,676→"+61만", +18,721→"+1.9만", -3,640→"-3,640", +120,000,000→"+1.2억".
 */
export function signedMoneyShort(n: number, currency: Currency = "KRW"): string {
  return `${n >= 0 ? "+" : "-"}${moneyShort(Math.abs(n), currency)}`;
}

/**
 * 부호 없는 짧은 금액(목록·표용). KRW: ≥1억 "억", ≥1만 "만"(≥100만은 정수), 그 외 일반.
 * USD: $K/M 압축. wonCompact(억/조 전용)과 달리 만 단위까지 줄여 칸 안에 들어오게.
 * 예: 611,676→"61만", 18,721→"1.9만", 3,640→"3,640", 120,000,000→"1.2억".
 */
export function moneyShort(n: number, currency: Currency = "KRW"): string {
  const a = Math.abs(n);
  if (currency === "USD") return moneyCompact(a, "USD");
  if (a >= 1e8) return `${(a / 1e8).toFixed(a >= 1e9 ? 0 : 1)}억`;
  if (a >= 1e4)
    return `${a >= 1e6 ? Math.round(a / 1e4).toLocaleString() : (a / 1e4).toFixed(1)}만`;
  return `${Math.round(a).toLocaleString()}`;
}

export function pct(r: number, digits = 1): string {
  return `${(r * 100).toFixed(digits)}%`;
}

export function signedPct(r: number, digits = 1): string {
  return `${r >= 0 ? "+" : ""}${pct(r, digits)}`;
}

export function signedWon(n: number): string {
  return `${n >= 0 ? "+" : "-"}${won(Math.abs(n))}`;
}

/** 큰 금액 압축 표기(재무제표용): 조/억 단위. 예 333.6조, 1,234억. */
export function wonCompact(n: number): string {
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1e12) return `${sign}${(a / 1e12).toFixed(1)}조`;
  if (a >= 1e8) return `${sign}${Math.round(a / 1e8).toLocaleString()}억`;
  return won(n);
}

/** 통화 인식 압축 표기. KRW=조/억, USD=$B/M/K. 재무제표·투시 등 큰 금액용. */
export function moneyCompact(n: number, currency: Currency = "KRW"): string {
  if (currency !== "USD") return wonCompact(n);
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(1)}K`;
  return `${sign}$${Math.round(a).toLocaleString()}`;
}

/** 상승/하락 색(한국식). 양수=상승(빨강), 음수=하락(파랑), 0=중립(무채색). */
export function changeColor(n: number): string {
  if (n > 0) return "var(--rise)";
  if (n < 0) return "var(--fall)";
  return "var(--muted-foreground)";
}
