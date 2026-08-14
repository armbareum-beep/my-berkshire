/**
 * 목표비중 — 저장 형식 단일 창구.
 *
 * 스펙 v1.1 §13.2 는 "Allocate 는 **평면 목표비중**만 쓴다. 환산은 **읽기 시점 1회**,
 * **저장은 평면으로 한다**"고 정했다. 그런데 구현은 읽기 환산(`allocate.ts:flattenTargets`)만
 * 만들고 쓰기를 만들지 않아서, 목표비중을 고치려면 레거시 2층 화면으로 나가야 했다.
 *
 * 이 파일은 **두 형식을 모두 읽고 평면 하나로 내주는** 창구다. 화면은 이제 저장 형식을
 * 몰라도 된다.
 *
 * ## 두 가지 저장 형식
 *
 * ```jsonc
 * // 레거시 2층 — holdings.target_weights + holdings.category_targets
 * // target_weights 값이 숫자다. "유형 안에서의 비중"이라 전체 대비가 아니다.
 * { "META": 0.4, "PLTR": 0.3 }        + { "assetType:주식": 0.6 }
 *
 * // 평면(스펙 §13.2) — target_weights 하나로 끝난다. 값이 객체다.
 * { "META": { "target": 0.15 }, "PLTR": { "target": 0.10, "hardCap": 0.14 } }
 * ```
 *
 * 판별은 **값의 타입**으로 한다(숫자 = 레거시, 객체 = 평면). 마이그레이션 없이 공존한다.
 *
 * ## 합계 규칙 — 두 형식이 다르다
 *
 * | | 합 < 1 | 합 > 1 |
 * |---|---|---|
 * | 레거시 | 정규화(기존 동작 보존) | 정규화 |
 * | 평면 | **그대로 둔다** — 나머지는 현금(§16.2) | 정규화(입력 실수) |
 *
 * 평면에서 정규화하지 않는 게 핵심이다. "META 15% + PLTR 10%, 나머지 현금"을
 * 60%/40% 로 부풀리면 사용자가 말한 적 없는 목표가 된다.
 */
import { flattenTargets } from "./allocate";

/** 종목 하나의 목표 규칙. 캡은 기본 배수와 다를 때만 저장한다. */
export interface TargetRule {
  /** 전체 자산 대비 목표비중 0~1. */
  target: number;
  /** 미지정 시 target × 1.25 (`allocate.ts:SOFT_CAP_MULTIPLE`). */
  softCap?: number;
  /** 미지정 시 target × 1.50 (`allocate.ts:HARD_CAP_MULTIPLE`). */
  hardCap?: number;
}

export type FlatTargets = Record<string, TargetRule>;

const isFiniteRate = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * 평면 형식인가. 값이 하나라도 객체면 평면으로 본다.
 * 빈 객체는 **레거시로 본다** — 저장된 게 없으면 환산 경로가 안전하다(둘 다 빈 결과).
 */
export function isFlatFormat(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  return Object.values(raw as Record<string, unknown>).some(
    (v) => v != null && typeof v === "object",
  );
}

/**
 * 합이 1을 넘으면 1로 맞춘다. 그 외에는 손대지 않는다.
 *
 * ⚠️ **이 길로는 이제 들어오지 않는다.** 저장 쪽에서 100% 초과를 막기 때문이다
 * (`app/allocate/actions.ts:overflowError`). 남겨두는 건 그 검증이 생기기 전에 저장된
 * 값과 손으로 고친 JSON 때문이다 — 합이 130% 인 맵을 그대로 엔진에 넣으면 목표비중이
 * 전부 뻥튀기된 배분안이 나온다. 마지막 안전망이지 정상 경로가 아니다.
 */
function capToOne(map: FlatTargets): FlatTargets {
  const sum = Object.values(map).reduce((s, r) => s + r.target, 0);
  if (sum <= 1 || sum <= 0) return map;
  const out: FlatTargets = {};
  for (const [symbol, rule] of Object.entries(map)) {
    out[symbol] = { ...rule, target: rule.target / sum };
  }
  return out;
}

/** 평면 저장값을 파싱. 값이 객체가 아니거나 target 이 비정상인 종목은 버린다. */
function parseFlat(raw: Record<string, unknown>): FlatTargets {
  const out: FlatTargets = {};
  for (const [symbol, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    if (!isFiniteRate(v.target) || v.target > 1) continue;
    const rule: TargetRule = { target: v.target };
    if (isFiniteRate(v.softCap)) rule.softCap = v.softCap;
    if (isFiniteRate(v.hardCap)) rule.hardCap = v.hardCap;
    out[symbol] = rule;
  }
  return capToOne(out);
}

/**
 * 레거시 2층 → 평면 환산. 환산식과 정규화는 이미 검증된 `allocate.ts:flattenTargets`
 * 를 그대로 쓴다(식을 두 벌 두면 조용히 갈라진다). 여기서는 `TargetRule` 로 감싸고
 * 목표가 0인 종목만 걷어낸다 — 화면에서 "0%로 정함"과 "안 정함"을 구분하지 않으므로.
 */
function convertLegacy(
  raw: Record<string, unknown>,
  categoryTargets: Record<string, number>,
  symbols: { symbol: string; assetType: string }[],
): FlatTargets {
  const flat = flattenTargets(
    symbols,
    categoryTargets,
    raw as Record<string, number>,
  );
  const out: FlatTargets = {};
  for (const [symbol, target] of Object.entries(flat)) {
    if (isFiniteRate(target)) out[symbol] = { target };
  }
  return out;
}

/**
 * 목표비중 읽기 — 저장 형식과 무관하게 평면으로 돌려준다.
 *
 * `symbols` 는 레거시 환산에만 쓴다(유형을 알아야 하므로). 평면 저장이면 무시된다 —
 * 그래서 **보유하지 않은 종목의 목표비중도 살아남는다**(Approved Universe 의 미보유 후보).
 */
export function readTargets(
  raw: unknown,
  categoryTargets: Record<string, number>,
  symbols: { symbol: string; assetType: string }[],
): FlatTargets {
  if (!raw || typeof raw !== "object") return {};
  const map = raw as Record<string, unknown>;
  return isFlatFormat(map)
    ? parseFlat(map)
    : convertLegacy(map, categoryTargets, symbols);
}

/**
 * 저장용 직렬화. target 이 0 이하인 종목은 **키를 지운다** — "0%로 정했다"와
 * "안 정했다"를 구분하지 않는다(레거시 `setTargetWeights` 와 같은 규칙).
 */
export function toStored(map: FlatTargets): Record<string, TargetRule> {
  const out: Record<string, TargetRule> = {};
  for (const [symbol, rule] of Object.entries(map)) {
    if (!isFiniteRate(rule.target)) continue;
    const stored: TargetRule = { target: rule.target };
    // 캡은 기본 배수와 다를 때만 남긴다(스펙 §13.2).
    if (rule.softCap != null) stored.softCap = rule.softCap;
    if (rule.hardCap != null) stored.hardCap = rule.hardCap;
    out[symbol] = stored;
  }
  return out;
}

/**
 * 한 종목의 목표비중만 바꾼 새 맵. 캡 오버라이드는 유지한다.
 * `target <= 0` 이면 그 종목을 뺀다.
 *
 * 합계는 검증하지 않는다 — 편집 도중에는 100% 를 안 맞추는 게 정상이고,
 * 합이 1 미만이면 나머지는 현금이라는 뜻이다(§16.2).
 */
export function withTarget(
  map: FlatTargets,
  symbol: string,
  target: number,
): FlatTargets {
  const out = { ...map };
  if (!isFiniteRate(target)) {
    delete out[symbol];
    return out;
  }
  out[symbol] = { ...out[symbol], target: Math.min(target, 1) };
  return out;
}

/** 목표비중 합(0~1). 화면에서 "남은 비중"을 보여줄 때 쓴다. */
export function totalTarget(map: FlatTargets): number {
  return Object.values(map).reduce((s, r) => s + r.target, 0);
}
