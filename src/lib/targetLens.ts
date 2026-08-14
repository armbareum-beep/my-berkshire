/**
 * 목표비중 **렌즈** — 하나의 진실을 여러 각도로 본다.
 *
 * ## 진실은 하나다
 *
 * 국가별·산업별 목표비중을 따로 저장하지 않는다(#70). 그러면 같은 것을 두 곳에서 정하게
 * 되어 스펙 §13.2 가 은퇴시킨 2층 구조가 되돌아온다. 저장되는 건 **종목별 평면 목표비중**
 * 하나뿐이고, 유형·국가·산업은 그걸 **묶어서 보는 렌즈**다.
 *
 * ```text
 *                      ┌─ 유형 렌즈 ─ 주식 70% / ETF 30%
 *   종목 평면 목표비중 ─┼─ 국가 렌즈 ─ 미국 60% / 한국 40%
 *   (유일한 저장값)     └─ 산업 렌즈 ─ 반도체 25% / 소비재 15% …
 * ```
 *
 * 이 파일은 그 묶기(`buildLens`)와, 반대로 **묶음을 움직여 진실을 다시 쓰는 것**
 * (`scaleGroupTarget`)을 한다. 화면은 계산하지 않는다.
 *
 * ## 두 가지 기준
 *
 * 비중은 늘 **전체 자산 대비**로 저장·계산한다. 그런데 "주식 안에서 META 가 몇 %인가"는
 * 다른 질문이라 그것만으로는 답이 안 된다. `withinBasis` 가 한 묶음을 100% 로 다시
 * 정규화해준다 — 저장값은 건드리지 않고 **보는 기준만** 바꾼다.
 */
import { tagLabel, type TagKey } from "./allocation";
import type { SecurityRecord } from "./securities";
import type { FlatTargets } from "./targetWeights";

/** 현금 묶음 라벨. */
export const CASH_LABEL = "현금";

/**
 * 통화 현금을 **목표 대상으로** 다룰 때 쓰는 예약 키 — `CASH:USD`.
 *
 * 달러·엔·원화를 들고 가는 것도 배분 결정이다("현금의 30%는 달러로"). 그런데 통화는
 * 종목이 아니라 `securities` 에 행이 없다. 그래서 **같은 평면 목표 맵에 예약 키로** 넣는다 —
 * 저장 형식을 새로 만들지 않으므로 §13.2 의 평면 원칙이 그대로 유지된다.
 *
 * 배분 엔진(`planAllocation`)은 이 키를 보지 못한다. 후보 목록에 없기 때문이다 —
 * 통화를 늘리는 건 매수가 아니라 **환전**이라 buy-only 배분과 성격이 다르다(스펙 §14.2).
 * 목표와 갭은 렌즈에서 보여주고, 실행은 거래 입력의 환전이 맡는다.
 */
export const CASH_PREFIX = "CASH:";

/** `USD` → `CASH:USD`. */
export function cashKey(currency: string): string {
  return CASH_PREFIX + currency.toUpperCase();
}

/** 이 목표 키가 통화 현금인가. */
export function isCashKey(symbol: string): boolean {
  return symbol.startsWith(CASH_PREFIX);
}

/** `CASH:USD` → `USD`. 통화 키가 아니면 null. */
export function cashCurrency(symbol: string): string | null {
  return isCashKey(symbol) ? symbol.slice(CASH_PREFIX.length) : null;
}
/** 태그가 없어 모인 묶음. 구성이 유동적이라 그룹 단위 조정을 막는다. */
const UNTAGGED = new Set(["미분류", "기타"]);

export interface LensHolding {
  symbol: string;
  name: string;
  /** 평가액(표시통화). */
  value: number;
}

export interface LensMember {
  symbol: string;
  label: string;
  value: number;
  /** 현재 비중 0~1. */
  current: number;
  /** 목표비중 0~1. 안 정했으면 0. */
  target: number;
  held: boolean;
}

export interface LensGroup {
  label: string;
  value: number;
  /** 현재 비중 0~1. */
  current: number;
  /** 구성 종목 목표의 합 0~1. */
  target: number;
  /** 목표 − 현재. 양수면 더 채워야 한다는 뜻. */
  gap: number;
  members: LensMember[];
  /** 현금 묶음인가. */
  isCash: boolean;
  /** 미분류·기타인가 — 그룹 단위 조정에서 뺀다. */
  isUntagged: boolean;
}

export interface LensInput {
  holdings: LensHolding[];
  cash: number;
  meta: Record<string, SecurityRecord | undefined>;
  targets: FlatTargets;
}

/** 묶음 정렬 — 현금 최하단, 그 위에 미분류·기타, 나머지는 평가액 내림차순. */
function pinnedOrder(label: string): number {
  if (label === CASH_LABEL) return 2;
  if (UNTAGGED.has(label)) return 1;
  return 0;
}

/**
 * 한 렌즈로 묶는다.
 *
 * **보유하지 않은 목표 종목도 넣는다.** "아직 안 샀지만 미국 20% 목표"가 빠지면 목표 합이
 * 실제와 달라진다(#70). 그런 종목은 `held: false`, 평가액 0 으로 참여한다.
 *
 * **현금은 목표 합의 나머지다.** 목표 합이 100% 미만이면 나머지는 현금으로 두겠다는
 * 뜻이다(스펙 §16.2) — 그래서 현금 묶음의 목표는 `1 − Σ목표`다.
 */
export function buildLens(input: LensInput, key: TagKey): LensGroup[] {
  const { holdings, cash, meta, targets } = input;

  const total = holdings.reduce((s, h) => s + h.value, 0) + Math.max(0, cash);
  const denom = total > 0 ? total : 0;
  const weight = (v: number) => (denom > 0 ? v / denom : 0);

  const groups = new Map<string, LensGroup>();
  const push = (label: string, member: LensMember) => {
    const g =
      groups.get(label) ??
      ({
        label,
        value: 0,
        current: 0,
        target: 0,
        gap: 0,
        members: [],
        isCash: label === CASH_LABEL,
        isUntagged: UNTAGGED.has(label),
      } satisfies LensGroup);
    g.value += member.value;
    g.target += member.target;
    g.members.push(member);
    groups.set(label, g);
  };

  const seen = new Set<string>();
  for (const h of holdings) {
    seen.add(h.symbol);
    push(tagLabel(meta[h.symbol], key), {
      symbol: h.symbol,
      label: h.name,
      value: h.value,
      current: weight(h.value),
      target: targets[h.symbol]?.target ?? 0,
      held: true,
    });
  }

  // 목표만 있고 아직 안 산 종목 — 빠지면 묶음 목표 합이 진실과 어긋난다.
  for (const [symbol, rule] of Object.entries(targets)) {
    if (seen.has(symbol) || rule.target <= 0) continue;
    push(tagLabel(meta[symbol], key), {
      symbol,
      label: meta[symbol]?.name ?? symbol,
      value: 0,
      current: 0,
      target: rule.target,
      held: false,
    });
  }

  // 현금 — 목표 합의 나머지(§16.2).
  const targetSum = Object.values(targets).reduce((s, r) => s + r.target, 0);
  const cashTarget = Math.max(0, 1 - targetSum);
  if (cash > 0 || cashTarget > 1e-9) {
    const g = groups.get(CASH_LABEL) ?? {
      label: CASH_LABEL,
      value: 0,
      current: 0,
      target: 0,
      gap: 0,
      members: [],
      isCash: true,
      isUntagged: false,
    };
    g.value += Math.max(0, cash);
    g.target += cashTarget;
    groups.set(CASH_LABEL, g);
  }

  return [...groups.values()]
    .map((g) => {
      const current = weight(g.value);
      return {
        ...g,
        current,
        gap: g.target - current,
        members: g.members.sort((a, b) => b.value - a.value || b.target - a.target),
      };
    })
    .sort((a, b) => {
      const pa = pinnedOrder(a.label);
      const pb = pinnedOrder(b.label);
      if (pa !== pb) return pa - pb;
      return b.value - a.value || b.target - a.target;
    });
}

/**
 * 한 묶음을 100% 로 다시 정규화한 구성원 — "주식 안에서 META 가 몇 %".
 *
 * 저장값은 건드리지 않는다. 분모만 그룹 합으로 바꾼다. 그룹 합이 0이면 나눌 수 없으므로
 * 0 을 돌려준다(0으로 나눠 NaN 을 만들지 않는다).
 */
export function withinBasis(group: LensGroup): LensMember[] {
  const cur = group.members.reduce((s, m) => s + m.current, 0);
  const tgt = group.members.reduce((s, m) => s + m.target, 0);
  return group.members.map((m) => ({
    ...m,
    current: cur > 0 ? m.current / cur : 0,
    target: tgt > 0 ? m.target / tgt : 0,
  }));
}

/**
 * 묶음 목표를 옮긴다 — **구성 종목 목표를 비례로 늘리고 줄여** 평면에 다시 쓴다.
 *
 * "미국 60%" 를 그 자체로 저장하지 않는 이유는 파일 첫머리와 같다. 대신 미국 종목들의
 * 목표를 같은 비율로 움직여 **합이 60% 가 되게** 만든다. 종목 사이의 상대 비율은 사용자가
 * 정한 그대로 보존된다.
 *
 * ```text
 *   미국 = META 20% + NVDA 10%  (합 30%)
 *   → "미국 60%" → factor 2 → META 40% + NVDA 20%
 * ```
 *
 * ## 아직 아무 목표도 없는 묶음
 *
 * 비례로 늘릴 기준이 없다. 이때는 **현재 평가액 비율**로 나눈다 — 이미 들고 있는 만큼이
 * 그 사람의 현재 판단이라 가장 덜 놀랍다. 평가액도 전부 0이면(전부 미보유) 균등 분배한다.
 *
 * `next` 가 0 이면 구성 종목 목표를 **지운다**(0% 로 정함 = 안 정함, `toStored` 와 같은 규칙).
 */
export function scaleGroupTarget(
  targets: FlatTargets,
  members: { symbol: string; value: number }[],
  next: number,
): FlatTargets {
  if (!Number.isFinite(next) || next < 0) return targets;
  const clamped = Math.min(next, 1);
  const out: FlatTargets = { ...targets };

  if (members.length === 0) return out;

  if (clamped <= 0) {
    for (const m of members) delete out[m.symbol];
    return out;
  }

  const sum = members.reduce((s, m) => s + (targets[m.symbol]?.target ?? 0), 0);

  if (sum > 0) {
    const factor = clamped / sum;
    for (const m of members) {
      const cur = targets[m.symbol]?.target ?? 0;
      if (cur <= 0) continue; // 목표가 없던 종목은 끌어들이지 않는다.
      out[m.symbol] = { ...out[m.symbol], target: cur * factor };
    }
    return out;
  }

  // 기준이 없는 묶음 — 현재 평가액 비율, 그것도 없으면 균등.
  const valueSum = members.reduce((s, m) => s + Math.max(0, m.value), 0);
  for (const m of members) {
    const share =
      valueSum > 0 ? Math.max(0, m.value) / valueSum : 1 / members.length;
    const target = clamped * share;
    if (target > 0) out[m.symbol] = { ...out[m.symbol], target };
  }
  return out;
}

/** 목표 합(0~1+). 화면이 "합계 120%" 같은 경고를 낼 때 쓴다. */
export function sumTargets(map: FlatTargets): number {
  return Object.values(map).reduce((s, r) => s + r.target, 0);
}
