/**
 * Allocate — "새 돈이 생겼을 때 무엇을 얼마나 살 것인가".
 *
 * 스펙 v1.1 §14·§15 와 Capital Allocator PRD v0.3 §6·§7·§8 이 **합의하는 구간**만 구현한다.
 * (대조: `docs/spec-vs-prd-reconciliation.md` §1)
 *
 *   1) 목표비중 부족분(gap)을 구한다
 *   2) 현재 비중이 Soft/Hard Cap 에 걸리면 우선순위를 깎거나 제외한다
 *   3) 남은 후보에 신규자금을 비례 배분한다
 *
 * 두 문서가 갈리는 지점은 **1단계의 정렬 신호**뿐이다(부족분 vs 기대수익률).
 * 그래서 `attractiveness` 훅을 열어둔다 — 밸류에이션을 채택하면 여기에 Expected CAGR 을
 * 물리고, 채택하지 않으면 1.0(중립)이라 순수 비중 기반으로 동작한다. 어느 쪽이든 이 엔진은
 * 그대로 쓴다.
 *
 * 기존 `rebalance.ts:planInvestment` 와의 차이는 **잔여금 처리 하나**다.
 * 거긴 부족분을 다 채우고 남으면 목표비중 비례로 마저 뿌린다(전액 투자).
 * 여긴 부족분까지만 채우고 남는 건 현금으로 남긴다 — PRD §8 "매력적인 기회가 부족하면
 * 현금을 남긴다". 기존 리밸런싱 화면의 동작은 건드리지 않았다.
 */

/** 캡 기본 배수 — 스펙 §14, PRD §3.2 (두 문서 동일). */
export const SOFT_CAP_MULTIPLE = 1.25;
export const HARD_CAP_MULTIPLE = 1.5;

/**
 * 비중 구간별 우선순위 계수.
 * v1.0 스펙은 soft/hard 를 모두 "제외"로 둬서 hard_cap 이 죽은 파라미터였다(§14 v1.1 정정).
 * soft 는 **감액**, hard 만 **제외**로 두 파라미터가 실제로 다르게 동작하게 한다.
 */
export const PRIORITY = {
  /** 목표비중 이하 — 정상 매수 대상. */
  normal: 1,
  /** 목표 초과 ~ Soft Cap — 우선순위 하향. */
  overTarget: 0.25,
  /** Soft Cap ~ Hard Cap — 강한 하향(완전 배제는 아님). */
  overSoft: 0.05,
  /** Hard Cap 이상 — 추가매수 금지. */
  overHard: 0,
} as const;

/** 배분 대상 한 칸. 부동산·생활현금·대출은 여기 넣지 않는다(스펙 §12.2). */
export interface AllocateTarget {
  key: string;
  label: string;
  /** 현재 평가액(표시통화로 환산된 값). */
  value: number;
  /** 목표비중 0~1. */
  target: number;
  /** 미지정 시 target × 1.25. */
  softCap?: number;
  /** 미지정 시 target × 1.50. */
  hardCap?: number;
  /**
   * 밸류에이션 매력도 계수(PRD §5 Expected CAGR 연결점). 미지정 시 1.0.
   * 0 이면 후보에서 빠진다 — "기대수익률이 요구수익률에 못 미침".
   */
  attractiveness?: number;
}

export type AllocateStatus =
  /** 목표비중 미달 — 정상 매수. */
  | "BUY"
  /** 목표는 넘었지만 Soft Cap 미만 — 우선순위 낮춰 매수. */
  | "TRIM_PRIORITY"
  /** Soft Cap 이상 Hard Cap 미만 — 사실상 대기. */
  | "WAIT"
  /** Hard Cap 이상 — 추가매수 금지. */
  | "BLOCKED"
  /** 이미 목표 평가액을 채워 살 것이 없음. */
  | "FILLED";

export interface AllocateLeg {
  key: string;
  label: string;
  /** 이번에 넣을 금액. */
  amount: number;
  /** 배분 전 비중 0~1. */
  currentWeight: number;
  targetWeight: number;
  /** 배분 후 예상 비중 0~1. */
  weightAfter: number;
  status: AllocateStatus;
}

export interface AllocatePlan {
  legs: AllocateLeg[];
  /** 배분되지 않고 남긴 현금. */
  remainingCash: number;
  /** 배분 전 대상 자산 합계(= 비중 계산의 분모, 스펙 §16.1). */
  portfolioValue: number;
}

function capsOf(t: AllocateTarget) {
  return {
    soft: t.softCap ?? t.target * SOFT_CAP_MULTIPLE,
    hard: t.hardCap ?? t.target * HARD_CAP_MULTIPLE,
  };
}

/** 현재 비중으로 상태·우선순위 계수를 판정. gap 이 0이면 FILLED 로 덮어쓴다. */
function classify(
  currentWeight: number,
  t: AllocateTarget,
): { status: AllocateStatus; priority: number } {
  const { soft, hard } = capsOf(t);
  if (currentWeight >= hard) return { status: "BLOCKED", priority: PRIORITY.overHard };
  if (currentWeight >= soft) return { status: "WAIT", priority: PRIORITY.overSoft };
  if (currentWeight > t.target)
    return { status: "TRIM_PRIORITY", priority: PRIORITY.overTarget };
  return { status: "BUY", priority: PRIORITY.normal };
}

/**
 * 신규자금 배분 계획.
 *
 * · 목표 평가액 = (현재 총액 + 투자금) × 목표비중
 * · 부족분 = max(0, 목표 − 현재), 여기에 캡 계수·매력도를 곱해 가중치를 만든다
 * · 투자금을 가중 부족분 비례로 나누되, **각 칸의 실제 부족분을 넘지 않는다**
 * · 남는 돈은 현금으로 남긴다(PRD §8)
 *
 * 매도는 계산하지 않는다 — buy-only(스펙 §14.2, PRD §7).
 */
export function planAllocation(
  targets: AllocateTarget[],
  invest: number,
): AllocatePlan {
  const portfolioValue = targets.reduce((s, t) => s + t.value, 0);
  const capital = Math.max(0, invest);
  const future = portfolioValue + capital;

  const rows = targets.map((t) => {
    // 분모가 0이면(첫 투자) 비중은 0 — 전부 BUY 후보가 된다.
    const currentWeight = portfolioValue > 0 ? t.value / portfolioValue : 0;
    const { status, priority } = classify(currentWeight, t);
    const gap = Math.max(0, future * t.target - t.value);
    const attractiveness = t.attractiveness ?? 1;
    return {
      t,
      currentWeight,
      gap,
      // gap 이 0이면 살 것이 없다는 뜻이라 캡 판정보다 이 사실이 우선한다.
      status: gap <= 0 && status !== "BLOCKED" ? ("FILLED" as AllocateStatus) : status,
      weight: gap * priority * Math.max(0, attractiveness),
    };
  });

  const totalWeight = rows.reduce((s, r) => s + r.weight, 0);

  // 1차 배분: 가중치 비례. 단 각 칸의 실제 부족분을 상한으로 둔다(목표 초과매수 방지).
  let spent = 0;
  const amounts = rows.map((r) => {
    if (totalWeight <= 0 || capital <= 0) return 0;
    const raw = capital * (r.weight / totalWeight);
    const amount = Math.min(raw, r.gap);
    spent += amount;
    return amount;
  });

  const legs: AllocateLeg[] = rows.map((r, i) => ({
    key: r.t.key,
    label: r.t.label,
    amount: amounts[i],
    currentWeight: r.currentWeight,
    targetWeight: r.t.target,
    weightAfter: future > 0 ? (r.t.value + amounts[i]) / future : 0,
    status: r.status,
  }));

  return {
    legs,
    // 상한에 걸려 못 쓴 돈 + 후보가 없어 남은 돈. 전액 투자를 강요하지 않는다.
    remainingCash: Math.max(0, capital - spent),
    portfolioValue,
  };
}

/**
 * 2층 목표비중(유형 → 유형 내 종목)을 평면으로 환산 — 스펙 §13.2.
 *
 *   flat(symbol) = categoryTargets[assetType] × withinTargets[symbol]
 *
 * 현행 `/rebalance` 가 쓰는 저장 형식을 Allocate 의 평면 모델로 옮길 때 쓴다.
 * 합이 1이 아니면 정규화한다(둘 중 한 층만 채워둔 기존 사용자 대응).
 */
export function flattenTargets(
  symbols: { symbol: string; assetType: string }[],
  categoryTargets: Record<string, number>,
  withinTargets: Record<string, number>,
): Record<string, number> {
  const flat: Record<string, number> = {};
  for (const { symbol, assetType } of symbols) {
    const type = categoryTargets[`assetType:${assetType}`] ?? 0;
    const within = withinTargets[symbol] ?? 0;
    flat[symbol] = type * within;
  }
  const sum = Object.values(flat).reduce((s, v) => s + v, 0);
  if (sum <= 0) return flat;
  for (const k of Object.keys(flat)) flat[k] = flat[k] / sum;
  return flat;
}
