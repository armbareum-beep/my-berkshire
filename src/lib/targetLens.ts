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
 * ## 분모는 **증권**이다 — 현금은 안 센다
 *
 * 목표비중은 배분 대상 증권을 100% 로 보고 나눈 값이고, 엔진도 같은 분모를 쓴다
 * (`lib/allocate.ts:planAllocation` 의 `portfolioValue`). 한때 화면만 현금을 더해 나눴는데,
 * 그러면 같은 "45%" 를 화면은 *증권+현금의 45%* 로 말하고 엔진은 *증권의 45%* 로 계산해
 * 배분액이 조용히 깎였다. 사용자 지적: *"비중 조절할 때 현금은 빼주는 게 낫겠어."*
 *
 * 현금은 **안 채운 만큼 남는 결과**다. 얼마를 현금으로 둘지는 레일 2단계(넣을 금액)가 정한다.
 * 통화 현금 목표(`CASH:USD`)만 예외로 같은 맵에 살지만, 분모가 **현금**이라 증권의 100%
 * 와 서로 간섭하지 않는다(`sumTargets` / `roomFor` 가 걸러낸다).
 *
 * ## 두 가지 기준
 *
 * 비중은 늘 **증권 전체 대비**로 저장·계산한다. 그런데 "주식 안에서 META 가 몇 %인가"는
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

/**
 * 태그가 없어 모인 묶음인가.
 *
 * 판정을 한 곳에 둔다 — 화면마다 따로 적으면 어디선 "기타"를 묶음으로 조정할 수 있고
 * 어디선 못 하는 상태로 조용히 갈라진다.
 */
export function isUntaggedLabel(label: string): boolean {
  return UNTAGGED.has(label);
}

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
  /** 미분류·기타인가 — 그룹 단위 조정에서 뺀다. */
  isUntagged: boolean;
}

export interface LensInput {
  holdings: LensHolding[];
  meta: Record<string, SecurityRecord | undefined>;
  targets: FlatTargets;
}

/** 묶음 정렬 — 미분류·기타를 맨 아래로, 나머지는 평가액 내림차순. */
function pinnedOrder(label: string): number {
  return UNTAGGED.has(label) ? 1 : 0;
}

/**
 * 한 렌즈로 묶는다.
 *
 * **보유하지 않은 목표 종목도 넣는다.** "아직 안 샀지만 미국 20% 목표"가 빠지면 목표 합이
 * 실제와 달라진다(#70). 그런 종목은 `held: false`, 평가액 0 으로 참여한다.
 *
 * **현금은 묶음으로 세우지 않는다.** 분모도 증권만이다(파일 첫머리). 목표 합이 100%
 * 미만이면 그만큼이 현금으로 남는다.
 */
export function buildLens(input: LensInput, key: TagKey): LensGroup[] {
  const { holdings, meta, targets } = input;

  // 분모는 **증권만**이다 — 엔진(`planAllocation` 의 `portfolioValue`)과 같은 기준.
  // 예전엔 현금을 더해 나눴는데, 그러면 같은 "45%" 를 화면과 엔진이 다르게 읽었다.
  const total = holdings.reduce((s, h) => s + h.value, 0);
  const weight = (v: number) => (total > 0 ? v / total : 0);

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
    // 통화 현금 키는 종목이 아니다 — 태그가 없어 "주식/기타" 로 묶이면 엉뚱한 묶음이 된다.
    if (seen.has(symbol) || rule.target <= 0 || isCashKey(symbol)) continue;
    push(tagLabel(meta[symbol], key), {
      symbol,
      label: meta[symbol]?.name ?? symbol,
      value: 0,
      current: 0,
      target: rule.target,
      held: false,
    });
  }

  // 현금은 묶음으로 세우지 않는다. 목표비중은 **증권끼리** 나누는 것이고, 현금은 그중
  // 안 채운 만큼 남는 결과다 — 사용자 지적: *"비중 조절할 때 현금은 빼주는 게 낫겠어."*
  // 목록에 끼워 두면 분모가 커져 현금 비중이 실제보다 부풀려 보이기도 했다.

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

/** 고정할 축의 한 칸. `stratum` 이 "이 종목이 고정 축에서 어디에 속하는가"다. */
export interface LockedMember {
  symbol: string;
  value: number;
  stratum: string;
}

export interface LockedResult {
  targets: FlatTargets;
  /**
   * **고정에 실패한 양**(0~1). 상계할 종목이 없어 현금에서 가져오거나 현금으로 흘려보낸
   * 몫이다. 0 이 아니면 고정 축이 그만큼 움직였다는 뜻이라 화면이 사용자에게 말해야 한다.
   */
  shortfall: number;
}

/**
 * 묶음 목표를 옮기되 **다른 축은 그대로 둔다** — "축 고정".
 *
 * ## 왜 필요한가
 *
 * `scaleGroupTarget` 은 미는 묶음만 건드리고 늘어난 몫을 현금에서 가져온다. 그래서 국가를
 * 밀면 유형이 따라 움직였다 — 미국을 올리면 미국 ETF 목표도 같이 커지기 때문이다.
 * 사용자 지적: *"유형 국가 산업이 모두 연동되어 있어? 연동 안 되게 하는 건 어때?"*
 *
 * 세 축을 **따로 저장**해서 푸는 길은 없다. 같은 종목을 세 번 세는 것이라 서로 모순될 수
 * 있고(미국 보유가 전부 주식인데 "주식 45% · 미국 60%"), 그러면 엔진이 하나만 따르고
 * 나머지는 장식이 된다 — 스펙 §13.2 가 은퇴시킨 2층 구조의 3층 판이다.
 *
 * ## 대신 **부족분을 어디서 가져오는지**를 바꾼다
 *
 * 현금이 아니라 **고정 축의 같은 칸에 있는 다른 종목**에서 가져온다.
 *
 * ```text
 *   미국 = META(주식 30%) + SPY(ETF 20%)      한국 = 삼성(주식 15%) + KODEX(ETF 10%)
 *
 *   미국 50% → 60%
 *     주식 칸: META 30→36  ⇄  삼성 15→9      (주식 합 45% 그대로)
 *     ETF  칸: SPY  20→24  ⇄  KODEX 10→6     (ETF  합 30% 그대로)
 *   결과: 미국 60 · 한국 15 · 현금 25 — 유형도 현금도 안 움직였다
 * ```
 *
 * 스트라텀별 몫은 **묶음 안의 구성 비율 그대로** 나눈다(위에서 6:4). 그래야 "미국을
 * 올렸더니 미국 안에서 ETF 비중만 커지는" 일이 없다.
 *
 * ## 늘 되지는 않는다
 *
 * 한국에 ETF 가 없으면 ETF 칸에서 가져올 데가 없다. 그때는 **가능한 만큼만 상계하고
 * 나머지는 현금에서** 가져온 뒤 그 양을 `shortfall` 로 돌려준다 — 조용히 덜 옮기면
 * 사용자가 요청한 60% 가 안 되고, 조용히 다 가져가면 고정이 깨진 걸 모른다. 둘 다 아니고
 * **요청대로 옮기되 깨진 만큼을 말한다.**
 *
 * 각 칸 안에서의 분배는 `scaleGroupTarget` 이 그대로 한다 — 규칙을 두 벌 두면 갈라진다.
 */
export function scaleGroupLocked(
  targets: FlatTargets,
  /** 미는 묶음의 구성원. */
  members: LockedMember[],
  /** 같은 축의 나머지 종목 전부 — 여기서 상계한다. 현금 키는 넣지 않는다. */
  others: LockedMember[],
  next: number,
): LockedResult {
  if (!Number.isFinite(next) || next < 0) return { targets, shortfall: 0 };
  if (members.length === 0) return { targets, shortfall: 0 };

  const clamped = Math.min(next, 1);
  const targetOf = (s: string) => targets[s]?.target ?? 0;
  const sumOf = (list: LockedMember[]) =>
    list.reduce((s, m) => s + targetOf(m.symbol), 0);

  const current = sumOf(members);
  const delta = clamped - current;
  if (Math.abs(delta) < 1e-12) return { targets, shortfall: 0 };

  const by = (list: LockedMember[]) => {
    const map = new Map<string, LockedMember[]>();
    for (const m of list) map.set(m.stratum, [...(map.get(m.stratum) ?? []), m]);
    return map;
  };
  const inBy = by(members);
  const outBy = by(others);

  // 스트라텀별 몫 — 지금 목표가 있으면 그 비율로, 없으면 평가액으로, 그것도 없으면 균등.
  const valueSum = members.reduce((s, m) => s + Math.max(0, m.value), 0);
  const shareOf = (list: LockedMember[]): number => {
    if (current > 0) return sumOf(list) / current;
    if (valueSum > 0)
      return list.reduce((s, m) => s + Math.max(0, m.value), 0) / valueSum;
    return list.length / members.length;
  };

  let out = targets;
  let shortfall = 0;

  for (const [stratum, mine] of inBy) {
    const theirs = outBy.get(stratum) ?? [];
    const d = delta * shareOf(mine);
    if (Math.abs(d) < 1e-12) continue;

    const theirSum = sumOf(theirs);
    // 상계 가능량 — 가져올 땐 저쪽 목표까지, 돌려줄 땐 제한이 없다(받을 종목만 있으면).
    const absorbed =
      theirs.length === 0 ? 0 : d > 0 ? Math.min(d, theirSum) : d;
    shortfall += Math.abs(d - absorbed);

    // 요청한 만큼은 그대로 옮긴다 — 상계가 모자란 몫은 현금이 낸다.
    out = scaleGroupTarget(out, mine, sumOf(mine) + d);
    if (theirs.length > 0)
      out = scaleGroupTarget(out, theirs, Math.max(0, theirSum - absorbed));
  }

  return { targets: out, shortfall };
}

/**
 * 목표 합을 **정확히 100%로** 맞춘다 — 종목 목표를 통째로 비례 조정한다.
 *
 * 축 고정을 켜면 어느 묶음을 밀어도 상계가 일어나 **합이 안 변한다**(그게 고정의 정의다).
 * 그래서 합이 85% 인 채로 시작하면 영영 85% 다. 예전엔 현금 줄이 그 손잡이였는데, 현금을
 * 목록에서 빼면서 손잡이도 같이 사라졌다. 이 함수가 그 자리를 대신한다.
 *
 * 전 종목이 같은 비율로 움직이므로 **세 축의 상대 모양이 전부 보존된다** — 유형·국가·산업
 * 어느 각도로 봐도 비율은 그대로고 합만 100% 가 된다.
 *
 * 통화 현금 목표(`CASH:USD`)는 분모가 달라(현금 안에서) 건드리지 않는다.
 */
export function normalizeTargets(targets: FlatTargets): FlatTargets {
  const securities = Object.keys(targets).filter((s) => !isCashKey(s));
  if (securities.length === 0) return targets;
  return scaleGroupTarget(
    targets,
    securities.map((symbol) => ({ symbol, value: targets[symbol].target })),
    1,
  );
}

/**
 * 목표 합(0~1+) — **증권만.** 통화 현금 키는 세지 않는다.
 *
 * 목표비중의 분모는 배분 대상 증권이다(`lib/allocate.ts:planAllocation` 의 `portfolioValue`).
 * 현금은 그 100% 를 나눠 갖는 항목이 아니라 **안 채운 만큼 남는 결과**다 — 사용자 지적:
 * *"비중 조절할 때 현금은 빼주는 게 낫겠어."*
 *
 * 통화 현금 목표(`CASH:USD`)는 "현금 안에서 달러를 얼마나"라 분모가 아예 다르다
 * (`/allocation/cash`). 같은 맵에 살지만 다른 100% 를 나눠 갖는다.
 */
export function sumTargets(map: FlatTargets): number {
  return Object.entries(map).reduce(
    (s, [symbol, r]) => (isCashKey(symbol) ? s : s + r.target),
    0,
  );
}

/** 통화 현금 목표만의 합(0~1) — 분모는 **현금**이다. */
export function sumCashTargets(map: FlatTargets): number {
  return Object.entries(map).reduce(
    (s, [symbol, r]) => (isCashKey(symbol) ? s + r.target : s),
    0,
  );
}

/**
 * **지금 여기에 넣을 수 있는 최대치** — 100% 에서 *나머지* 목표의 합을 뺀 값.
 *
 * 목표 합은 100% 를 넘을 수 없다. 그런데 "넘으면 얼마까지 되는데?" 를 답하려면 지금
 * 고치는 대상**만 빼고** 더해야 한다 — 자기 자신을 포함해 세면 이미 20% 인 종목을
 * 20% 로 다시 저장하는 것조차 막힌다.
 *
 * ```text
 *   META 20% + NVDA 30% + 삼성 10%  (합 60%)
 *   NVDA 를 고칠 때의 여유 = 1 − (20% + 10%) = 70%
 * ```
 *
 * 묶음을 고칠 때는 그 묶음 구성원 전부를 `exclude` 로 넘긴다 — 묶음 목표는 구성원 목표를
 * 통째로 갈아끼우기 때문이다(`scaleGroupTarget`).
 */
export function roomFor(map: FlatTargets, exclude: Iterable<string>): number {
  const skip = new Set(exclude);
  let others = 0;
  for (const [symbol, rule] of Object.entries(map)) {
    // 통화 현금 목표는 **현금 안에서의** 비중이라 증권 예산을 안 쓴다(`sumTargets`).
    if (!skip.has(symbol) && !isCashKey(symbol)) others += rule.target;
  }
  return Math.max(0, 1 - others);
}
