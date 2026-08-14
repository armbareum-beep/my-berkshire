"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveHolding } from "@/lib/holdings";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import {
  readTargets,
  toStored,
  withTarget,
  type TargetRule,
} from "@/lib/targetWeights";
import {
  buildLens,
  roomFor,
  scaleGroupTarget,
  sumTargets,
  CASH_LABEL,
} from "@/lib/targetLens";
import { pct } from "@/lib/format";
import type { TagKey } from "@/lib/allocation";
import {
  backfillSectors,
  loadSecurityMeta,
} from "@/lib/securities";
import type { Json } from "@/lib/supabase/database.types";

type Result = { ok: true } | { ok: false; error: string };

/** 반올림 오차로 저장이 막히지 않게 두는 여유. */
const OVER_EPS = 1e-9;

/**
 * **100% 를 넘기면 저장하지 않는다.**
 *
 * 예전엔 넘겨도 그냥 저장되고, 읽을 때 `capToOne` 이 전부를 비례로 축소했다. 그래서 80%
 * 를 넣었는데 화면에 72.7% 로 보였다 — 사용자가 시킨 적 없는 값이 조용히 만들어진 것이고,
 * 더 나쁜 건 **다른 종목의 목표까지 같이 줄었다**는 점이다.
 *
 * 나머지를 자동으로 줄이는 길(진짜 연동)도 있었지만 택하지 않았다. 한 칸을 고쳤을 뿐인데
 * 손대지 않은 값들이 전부 움직이면 "내가 정한 값"이 남지 않는다. 대신 **막고 여유를
 * 알려준다** — 줄일 곳은 사용자가 고른다.
 */
function overflowError(room: number): string {
  return room <= OVER_EPS
    ? "목표 합이 이미 100%예요. 다른 걸 먼저 줄여야 여기에 넣을 수 있어요."
    : `목표 합이 100%를 넘어요. 여기엔 ${pct(room)}까지 넣을 수 있어요 — 다른 걸 먼저 줄여주세요.`;
}

/**
 * 배분에 관련된 화면 전부. 하나가 바뀌면 나머지가 같이 틀어진다.
 *
 * `/allocation` 아래는 계층이 깊고 동적 구간이 섞여 있어(`financial/[type]`,
 * `group/[key]/[label]`) 주소를 하나씩 적으면 화면을 더할 때마다 빠뜨린다. 그래서
 * **서브트리 통째로** 지운다 — `type: "layout"` 은 그 아래 모든 레이아웃과 페이지를
 * 무효화한다(`next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md`).
 */
function revalidateAllocate() {
  revalidatePath("/allocate");
  // 렌즈 화면이 목표비중을 함께 보여준다 — 안 지우면 방금 바꾼 값이 옛 숫자로 보인다.
  revalidatePath("/allocation", "layout");
}

/**
 * 전사 기본 요구수익률("난이도") 저장 — PRD v0.3 §3.2.
 *
 * 종목별 `valuation_assumptions.er_required_return` 은 건드리지 않는다. 그쪽이 늘 우선이라
 * 여기서 덮으면 "이 기업만은 20% 아니면 안 산다"는 사용자의 개별 판단이 지워진다.
 * 되돌리려면 null 을 넘긴다 → 코드 기본값(12%)으로 복귀.
 */
export async function setHouseHurdle(rate: number | null): Promise<Result> {
  if (rate != null && !(rate > 0 && rate <= 1))
    return { ok: false, error: "요구수익률은 0~100% 사이여야 합니다." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const holding = await getActiveHolding(supabase);
  if (!holding) return { ok: false, error: "회사를 찾을 수 없습니다." };

  const { error } = await supabase
    .from("holdings")
    .update({ required_return: rate })
    .eq("id", holding.id);
  if (error) return { ok: false, error: error.message };

  // 허들이 바뀌면 배분 순위·매수 한도가 전부 다시 계산된다.
  revalidateAllocate();
  return { ok: true };
}

/**
 * 자본배분 후보(Approved Universe) 상태 저장 — PRD v0.3 §3.1.
 *
 * 보유 여부와 무관하게 한 행으로 다룬다. 보유 중인데 행이 없던 종목을 WATCH 로 내리면
 * 새 행이 생기고(= 명시적 제외), APPROVED 로 올리면 아직 안 산 기업도 후보가 된다.
 *
 * 종목을 지우지는 않는다 — 이 앱은 거래 원장을 지우지 않고, 후보 목록도 같은 원칙이다.
 */
export async function setUniverseStatus(
  symbol: string,
  status: "APPROVED" | "WATCH",
): Promise<Result> {
  if (!symbol) return { ok: false, error: "종목이 올바르지 않습니다." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const holding = await getActiveHolding(supabase);
  if (!holding) return { ok: false, error: "회사를 찾을 수 없습니다." };

  const { error } = await supabase
    .from("watchlist")
    .upsert(
      { holding_id: holding.id, symbol, status },
      { onConflict: "holding_id,symbol" },
    );
  if (error) return { ok: false, error: error.message };

  // 후보가 바뀌면 배분안도, 목표비중 목록도 달라진다.
  revalidateAllocate();
  revalidatePath("/rebalance");
  return { ok: true };
}

/**
 * 종목 하나의 목표비중 저장 — 스펙 v1.1 §13.2 의 **평면 저장**.
 *
 * 저장 형식이 아직 레거시 2층이면 이 저장이 곧 이사(migration)다 — 읽기 시점 환산 결과를
 * 그대로 평면으로 굳힌 뒤 이 종목만 바꿔 쓴다. 그래서 첫 저장 한 번으로 형식이 넘어가고,
 * 다른 종목의 목표비중도 환산된 값 그대로 보존된다.
 *
 * ⚠️ 환산에는 종목의 자산유형이 필요하다(유형 목표 × 유형 내 비중). 그래서 여기서
 * 포트폴리오와 securities 를 다시 읽는다 — 화면이 보낸 값을 믿고 쓰면 화면마다 다른
 * 유형을 보내 조용히 틀린 환산이 저장될 수 있다.
 *
 * 합이 1 **미만**인 건 검증하지 않는다 — 나머지는 현금이라는 뜻이다(§16.2). 하지만 1을
 * **넘기는** 저장은 막는다(`overflowError`).
 */
export async function setTargetWeight(
  symbol: string,
  /** 0~1. 0 이하면 그 종목을 목표에서 뺀다. */
  target: number,
): Promise<Result> {
  if (!symbol) return { ok: false, error: "종목이 올바르지 않습니다." };
  if (!Number.isFinite(target) || target < 0 || target > 1)
    return { ok: false, error: "목표비중은 0~100% 사이여야 합니다." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const holding = await getActiveHolding(supabase);
  if (!holding) return { ok: false, error: "회사를 찾을 수 없습니다." };

  // 레거시 환산에 필요한 자산유형 — 저장된 목표비중의 키 전부를 대상으로 잡는다.
  const stored = (holding.target_weights ?? {}) as Record<string, unknown>;
  const symbols = [...new Set([...Object.keys(stored), symbol])];
  const meta = await loadSecurityMeta(supabase, symbols);

  const current = readTargets(
    holding.target_weights,
    (holding.category_targets ?? {}) as Record<string, number>,
    symbols.map((s) => ({ symbol: s, assetType: meta[s]?.assetType ?? "주식" })),
  );

  // 자기 자신은 빼고 센다 — 포함해서 세면 20%인 종목을 20%로 다시 저장하는 것도 막힌다.
  const room = roomFor(current, [symbol]);
  if (target > room + OVER_EPS)
    return { ok: false, error: overflowError(room) };

  const next = toStored(withTarget(current, symbol, target));

  const { error } = await supabase
    .from("holdings")
    .update({ target_weights: next as unknown as Json })
    .eq("id", holding.id);
  if (error) return { ok: false, error: error.message };

  revalidateAllocate();
  revalidatePath("/rebalance");
  return { ok: true };
}

/**
 * 투자 가능 현금 저장 — 스펙 v1.1 §16.4. null 이면 "안 정함"(보유 현금 전액으로 폴백).
 *
 * ⚠️ **₩ 로 저장한다.** 화면은 표시통화로 입력받으므로 USD 화면이면 여기서 되돌린다.
 * 표시통화 그대로 저장하면 USD 로 넣은 값이 ₩ 화면에서 1/1400 로 보인다(§16.3).
 */
export async function setInvestableCash(
  /** 사용자가 입력한 금액 — `currency` 기준. */
  amount: number | null,
  currency: "KRW" | "USD",
): Promise<Result> {
  if (amount != null && (!Number.isFinite(amount) || amount < 0))
    return { ok: false, error: "0 이상의 금액을 넣어주세요." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const holding = await getActiveHolding(supabase);
  if (!holding) return { ok: false, error: "회사를 찾을 수 없습니다." };

  let krw = amount;
  if (amount != null && currency === "USD") {
    const portfolio = await getPortfolio(supabase);
    const rate = portfolio?.usdKrw;
    if (!rate || rate <= 0)
      return { ok: false, error: "환율을 아직 못 불러왔어요. 잠시 후 다시 시도해주세요." };
    krw = amount * rate;
  }

  const { error } = await supabase
    .from("holdings")
    .update({ investable_cash: krw })
    .eq("id", holding.id);
  if (error) return { ok: false, error: error.message };

  revalidateAllocate();
  return { ok: true };
}

/* 검색으로 새 종목을 넣던 `setTargetFromSearch` 는 지웠다 — 자본배분은 **이미 가진 것의
   비중을 다시 맞추는** 일이고, 새로 사는 건 기록(거래) 쪽 일이다. 죽은 서버 액션을 남기면
   없는 기능이 있는 것처럼 보인다. */

/** 그룹 조정 결과 — 되돌리기를 위해 **바꾸기 직전의 저장값**을 그대로 돌려준다. */
export type GroupTargetResult =
  | {
      ok: true;
      /** 직전 저장값(평면). `restoreTargets` 에 그대로 넘기면 원상복구된다. */
      previous: Record<string, TargetRule>;
      /** 바꾼 뒤의 목표 합(0~1+). 1을 넘으면 화면이 경고한다. */
      total: number;
    }
  | { ok: false; error: string };

/**
 * 묶음(유형·국가·산업) 목표를 옮긴다 — 예: "미국 60%".
 *
 * **묶음 목표를 그 자체로 저장하지 않는다.** 구성 종목의 평면 목표를 비례로 움직여 합이
 * 요청한 값이 되게 한다(`lib/targetLens.ts:scaleGroupTarget`). 진실은 여전히 종목 목표
 * 하나뿐이라 은퇴시킨 2층 구조가 되돌아오지 않는다(스펙 §13.2, #70).
 *
 * 구성원은 **서버에서 다시 묶는다** — 화면이 보낸 목록을 믿으면 화면과 저장이 갈릴 때
 * 엉뚱한 종목의 목표가 바뀐다.
 */
export async function setGroupTarget(
  key: TagKey,
  label: string,
  /** 0~1. 0 이면 그 묶음의 목표를 전부 지운다. */
  next: number,
): Promise<GroupTargetResult> {
  if (!label) return { ok: false, error: "묶음이 올바르지 않습니다." };
  if (!Number.isFinite(next) || next < 0 || next > 1)
    return { ok: false, error: "목표비중은 0~100% 사이여야 합니다." };
  if (label === CASH_LABEL)
    return {
      ok: false,
      error: "현금은 따로 정하지 않아요 — 목표를 안 채운 나머지가 현금입니다.",
    };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const portfolio = await getPortfolio(supabase);
  if (!portfolio) return { ok: false, error: "회사를 찾을 수 없습니다." };

  // 비중 비율만 쓰므로 표시통화는 결과에 영향이 없다(₩ 기준으로 고정).
  const dashboard = computeDashboard(portfolio, "KRW");
  const stored = (portfolio.holding.target_weights ?? {}) as Record<
    string,
    unknown
  >;
  const symbols = [
    ...new Set([
      ...dashboard.allocation.map((a) => a.symbol),
      ...Object.keys(stored),
    ]),
  ];
  const meta = await loadSecurityMeta(supabase, symbols);
  if (key === "sector") {
    const filled = await backfillSectors(supabase, meta);
    for (const [s, sec] of Object.entries(filled)) if (meta[s]) meta[s].sector = sec;
  }

  const current = readTargets(
    portfolio.holding.target_weights,
    (portfolio.holding.category_targets ?? {}) as Record<string, number>,
    symbols.map((s) => ({ symbol: s, assetType: meta[s]?.assetType ?? "주식" })),
  );

  const group = buildLens(
    {
      holdings: dashboard.allocation.map((a) => ({
        symbol: a.symbol,
        name: a.name,
        value: a.value,
      })),
      cash: dashboard.cash,
      meta,
      targets: current,
    },
    key,
  ).find((g) => g.label === label);

  if (!group) return { ok: false, error: "그 묶음을 찾지 못했어요." };
  if (group.isUntagged)
    return {
      ok: false,
      error: `"${label}"는 구성이 유동적이라 묶음으로 조정하지 않아요. 종목별로 정해주세요.`,
    };
  if (group.members.length === 0)
    return { ok: false, error: "이 묶음에 조정할 종목이 없어요." };

  // 묶음 목표는 구성원 목표를 통째로 갈아끼운다 — 그래서 구성원 전부를 빼고 여유를 센다.
  const room = roomFor(
    current,
    group.members.map((m) => m.symbol),
  );
  if (next > room + OVER_EPS) return { ok: false, error: overflowError(room) };

  const previous = toStored(current);
  const updated = toStored(
    scaleGroupTarget(
      current,
      group.members.map((m) => ({ symbol: m.symbol, value: m.value })),
      next,
    ),
  );

  const { error } = await supabase
    .from("holdings")
    .update({ target_weights: updated as unknown as Json })
    .eq("id", portfolio.holding.id);
  if (error) return { ok: false, error: error.message };

  revalidateAllocate();
  revalidatePath("/rebalance");
  return { ok: true, previous, total: sumTargets(updated) };
}

/**
 * 저장값을 통째로 되돌린다 — `setGroupTarget` 의 되돌리기 전용.
 *
 * 묶음 조정은 종목 여러 개를 한 번에 바꾸므로, 실수했을 때 하나씩 되돌리게 하면 안 된다.
 * 받은 값은 `readTargets`→`toStored` 를 태워 검증한다(임의 JSON 을 그대로 쓰지 않는다).
 */
export async function restoreTargets(
  stored: Record<string, TargetRule>,
): Promise<Result> {
  if (!stored || typeof stored !== "object")
    return { ok: false, error: "되돌릴 값이 올바르지 않습니다." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const holding = await getActiveHolding(supabase);
  if (!holding) return { ok: false, error: "회사를 찾을 수 없습니다." };

  // 평면 형식으로만 되돌린다 — 레거시 환산이 필요 없으므로 symbols 는 비운다.
  const safe = toStored(readTargets(stored, {}, []));

  const { error } = await supabase
    .from("holdings")
    .update({ target_weights: safe as unknown as Json })
    .eq("id", holding.id);
  if (error) return { ok: false, error: error.message };

  revalidateAllocate();
  revalidatePath("/rebalance");
  return { ok: true };
}
