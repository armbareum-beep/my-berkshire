"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveHolding } from "@/lib/holdings";
import { getPortfolio } from "@/lib/portfolio";
import { readTargets, toStored, withTarget } from "@/lib/targetWeights";
import { loadSecurityMeta, upsertSecurities } from "@/lib/securities";
import type { Json } from "@/lib/supabase/database.types";

type Result = { ok: true } | { ok: false; error: string };

/** 배분에 관련된 화면 전부. 하나가 바뀌면 나머지가 같이 틀어진다. */
function revalidateAllocate() {
  revalidatePath("/allocate");
  revalidatePath("/allocate/ranking");
  revalidatePath("/allocate/settings");
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
 * 합계는 검증하지 않는다. 편집 도중 100%를 안 맞추는 건 정상이고, 합이 1 미만이면
 * 나머지는 현금이라는 뜻이다(§16.2).
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

/**
 * 검색에서 바로 목표비중 지정 — 검색형 설정의 저장 경로.
 *
 * 리스트를 스크롤해 칸을 채우는 대신 **찾아서 정한다.** 그래서 한 번의 동작이 세 가지를
 * 한꺼번에 처리한다.
 *
 *   1. 종목명을 `securities` 에 적재 — 아직 보유도 관심도 아닌 기업이라 이름이 없을 수 있다
 *   2. 자본배분 **후보로 승격** — 목표비중을 정한다는 건 사겠다는 뜻이다. 후보 지정을
 *      따로 시키면 "비중을 넣었는데 왜 배분이 안 되지?"가 된다
 *   3. 목표비중 저장(평면)
 *
 * `target` 이 0 이면 목표비중만 지운다. **후보에서 빼지는 않는다** — 비중을 비우는 것과
 * 후보에서 제외하는 것은 다른 결정이고, 후자는 후보 목록에서 명시적으로 하게 둔다.
 */
export async function setTargetFromSearch(
  symbol: string,
  name: string,
  target: number,
): Promise<Result> {
  if (!symbol) return { ok: false, error: "종목이 올바르지 않습니다." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };
  if (name) await upsertSecurities(supabase, [{ symbol, name }]);

  if (target > 0) {
    const approved = await setUniverseStatus(symbol, "APPROVED");
    if (!approved.ok) return approved;
  }
  return setTargetWeight(symbol, target);
}
