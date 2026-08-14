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
 * ## 밸류에이션이 "비중까지" 움직이는 지점 — PRD §6.2
 *
 * `attractiveness` 만으로는 **순서**만 바뀐다. 매수 상한이 늘 목표비중이라
 * 기대수익률이 아무리 높아도 목표비중을 넘겨 살 수 없기 때문이다.
 *
 * PRD §6.2 는 여기서 한 걸음 더 간다.
 *
 * ```text
 * Target 이하        → 기본 요구수익률로 매수
 * Target ~ Soft Cap  → 매수 가능하되 **더 높은 기대수익률을 요구**(예: 12% → 15%)
 * Soft ~ Hard Cap    → 신규자금 투입 금지
 * Hard Cap 이상      → 추가매수 절대 금지
 * ```
 *
 * 그래서 매수 상한(`ceiling`)을 종목마다 다르게 잡는다 — 초과 허들을 넘긴 종목만
 * Soft Cap 까지 열어준다. 이게 "밸류에이션대로 비중이 조절된다"의 실체다.
 * 가정이 없는 종목의 상한은 그대로 목표비중이라 기존 동작이 바뀌지 않는다.
 *
 * 기존 `rebalance.ts:planInvestment` 와의 차이는 **잔여금 처리 하나**다.
 * 거긴 부족분을 다 채우고 남으면 목표비중 비례로 마저 뿌린다(전액 투자).
 * 여긴 부족분까지만 채우고 남는 건 현금으로 남긴다 — PRD §8 "매력적인 기회가 부족하면
 * 현금을 남긴다". 기존 리밸런싱 화면의 동작은 건드리지 않았다.
 */

import { DEFAULT_REQUIRED_RETURN } from "./finance/expectedReturn";

/** 캡 기본 배수 — 스펙 §14, PRD §3.2 (두 문서 동일). */
export const SOFT_CAP_MULTIPLE = 1.25;
export const HARD_CAP_MULTIPLE = 1.5;

/**
 * 목표비중을 넘겨 살 때 얹는 요구수익률 프리미엄 — PRD §6.2 의 "12% → 15%".
 * 기본 요구수익률에 더한다(비율이 아니라 %p 가산 — 요구수익률이 낮은 종목이
 * 자동으로 유리해지지 않게).
 */
export const OVERWEIGHT_PREMIUM = 0.03;

/** 목표 초과 매수 허들. `overweightRequiredReturn` 을 직접 주면 그게 우선한다. */
export function overweightHurdle(t: {
  requiredReturn?: number;
  overweightRequiredReturn?: number;
}): number {
  return (
    t.overweightRequiredReturn ??
    (t.requiredReturn ?? DEFAULT_REQUIRED_RETURN) + OVERWEIGHT_PREMIUM
  );
}

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
  /**
   * 현재가 기준 기대 CAGR(소수). **매수 상한**을 목표비중에서 Soft Cap 까지
   * 열어줄지 판단하는 데 쓴다(PRD §6.2). null/미지정 = 가정 없음 → 상한은 목표비중.
   */
  expectedCagr?: number | null;
  /** 이 종목의 요구수익률(소수). 미지정 시 12%. */
  requiredReturn?: number;
  /** 목표 초과 매수 허들(소수). 미지정 시 요구수익률 + 3%p. */
  overweightRequiredReturn?: number;
}

export type AllocateStatus =
  /** 목표비중 미달 — 정상 매수. */
  | "BUY"
  /** 목표를 넘었지만 기대수익률이 초과 허들을 넘겨 Soft Cap 까지 더 산다(PRD §6.2). */
  | "STRETCH"
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
  /** 이번 배분에서 허용한 최대 비중 — 목표비중, 또는 허들을 넘겼으면 Soft Cap. */
  ceilingWeight: number;
  status: AllocateStatus;
}

export interface AllocatePlan {
  legs: AllocateLeg[];
  /** 배분되지 않고 남긴 현금. */
  remainingCash: number;
  /** 배분 전 대상 자산 합계(= 비중 계산의 분모, 스펙 §16.1). */
  portfolioValue: number;
}

export interface PlanOptions {
  /**
   * 이번 배분에서 **돈을 받을 수 있는** 종목인가. 생략하면 전부 대상.
   *
   * "이번엔 주식만" / "이번엔 ETF만" 처럼 사용자가 묶음을 고른 경우에 쓴다.
   * 목록에서 빼고 부르면 안 된다 — `portfolioValue` 가 그 부분집합의 합이 되어
   * **현재 비중이 부풀려지기** 때문이다(주식만 넘기면 주식 비중이 전부 100% 쪽으로 뜬다).
   * 그래서 대상은 전부 넘기고, 여기서 가중치만 0으로 만든다. 분모·상태·캡 판정은 전체
   * 자산 기준 그대로 남고, 받지 못한 돈은 `remainingCash` 로 정직하게 남는다.
   */
  eligible?: (t: AllocateTarget) => boolean;
}

function capsOf(t: AllocateTarget) {
  return {
    soft: t.softCap ?? t.target * SOFT_CAP_MULTIPLE,
    hard: t.hardCap ?? t.target * HARD_CAP_MULTIPLE,
  };
}

/**
 * 이번 배분에서 이 종목을 어디까지 채울 수 있나 — PRD §6.2.
 *
 * 기본은 목표비중. 기대 CAGR 이 **초과 허들**(기본 요구수익률 + 3%p)을 넘으면
 * Soft Cap 까지 열어준다. 가정이 없으면(= expectedCagr null) 늘 목표비중이라
 * 밸류에이션을 쓰지 않는 사용자의 동작은 그대로다.
 */
function ceilingOf(t: AllocateTarget): { ceiling: number; stretched: boolean } {
  const cagr = t.expectedCagr;
  if (cagr == null || !Number.isFinite(cagr)) return { ceiling: t.target, stretched: false };
  if (cagr < overweightHurdle(t)) return { ceiling: t.target, stretched: false };
  const { soft } = capsOf(t);
  // soft 를 목표보다 낮게 설정한 사용자도 있으므로 목표 아래로는 내려가지 않는다.
  return { ceiling: Math.max(t.target, soft), stretched: soft > t.target };
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
 * · 매수 상한 = 목표비중, 단 기대 CAGR 이 초과 허들을 넘으면 Soft Cap (PRD §6.2)
 * · 목표 평가액 = (현재 총액 + 투자금) × 매수 상한
 * · 부족분 = max(0, 목표 − 현재), 여기에 캡 계수·매력도를 곱해 가중치를 만든다
 * · 투자금을 가중 부족분 비례로 나누되, **각 칸의 실제 부족분을 넘지 않는다**
 * · 남는 돈은 현금으로 남긴다(PRD §8)
 *
 * 매도는 계산하지 않는다 — buy-only(스펙 §14.2, PRD §7).
 */
export function planAllocation(
  targets: AllocateTarget[],
  invest: number,
  options: PlanOptions = {},
): AllocatePlan {
  const eligible = options.eligible ?? (() => true);
  const portfolioValue = targets.reduce((s, t) => s + t.value, 0);
  const capital = Math.max(0, invest);
  const future = portfolioValue + capital;

  const rows = targets.map((t) => {
    // 분모가 0이면(첫 투자) 비중은 0 — 전부 BUY 후보가 된다.
    const currentWeight = portfolioValue > 0 ? t.value / portfolioValue : 0;
    const base = classify(currentWeight, t);
    const { ceiling, stretched } = ceilingOf(t);
    const gap = Math.max(0, future * ceiling - t.value);
    const attractiveness = t.attractiveness ?? 1;

    // 초과 허들을 넘긴 종목이 목표를 넘어서 사는 경우: 우선순위를 깎지 않는다.
    // 이미 더 높은 요구수익률을 통과했으므로 여기서 또 깎으면 이중 페널티다(PRD §6.2).
    const promoted = stretched && base.status === "TRIM_PRIORITY";
    const status: AllocateStatus = promoted ? "STRETCH" : base.status;
    const priority = promoted ? PRIORITY.normal : base.priority;

    return {
      t,
      currentWeight,
      ceiling,
      gap,
      // gap 이 0이면 살 것이 없다는 뜻. 단 캡에 걸려 못 사는 것(WAIT/BLOCKED)까지
      // FILLED 로 덮으면 이유가 사라지므로, 목표를 채운 경우에만 바꿔 말한다.
      status:
        gap <= 0 && (status === "BUY" || status === "TRIM_PRIORITY" || status === "STRETCH")
          ? ("FILLED" as AllocateStatus)
          : status,
      // 대상에서 뺀 종목은 가중치 0 — 돈이 가지 않는다. 단 위에서 계산한 비중·상태는
      // 그대로 둔다(분모는 여전히 전체 자산이라 "이 종목은 지금 몇 %"가 거짓이 되지 않는다).
      weight: eligible(t) ? gap * priority * Math.max(0, attractiveness) : 0,
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
    ceilingWeight: r.ceiling,
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
