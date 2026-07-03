"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayKST } from "@/lib/date";
import { activeEventRows } from "@/lib/portfolio";
import { cumulativeBought, parsePlan, type RebalancePlan } from "@/lib/plan";
import type { InvestmentEvent } from "@/lib/finance/valuation";
import { getActiveHolding } from "@/lib/holdings";
import type { Json } from "@/lib/supabase/database.types";

type Result = { ok: true } | { ok: false; error: string };

/** 계획 아카이브 보관 한도(FIFO — 초과 시 가장 오래된 것부터 제거). */
const ARCHIVED_PLANS_CAP = 20;

/**
 * 현재 active_plan을 아카이브 배열에 append(완수 여부와 무관, 손상 JSON은 방어적으로 스킵).
 * 완수 여부·완수일은 저장하지 않는다(events에서 매번 재판정, 헌장 V) — 계획 원문만 보관.
 * 오래된 순(append)이라 앞(가장 오래된 것)부터 잘라 20개 상한을 지킨다.
 */
function archivePlan(
  currentArchived: unknown,
  activePlanRaw: unknown,
): RebalancePlan[] {
  const archived: RebalancePlan[] = Array.isArray(currentArchived)
    ? (currentArchived as unknown[])
        .map((p) => parsePlan(p))
        .filter((p): p is RebalancePlan => p !== null)
    : [];
  const parsed = parsePlan(activePlanRaw);
  if (!parsed) return archived; // 활성 계획이 없거나 손상됨 — 아카이브할 것 없음
  const next = [...archived, parsed];
  return next.length > ARCHIVED_PLANS_CAP
    ? next.slice(next.length - ARCHIVED_PLANS_CAP)
    : next;
}

/**
 * 유형 내 종목 목표비중 저장(소수, 0~1). 키=심볼, **유형별 합=1** 의미(전체 대비 아님).
 * 전역 합은 보유 유형 수만큼이라 합계 제약을 두지 않는다(유형별 검증은 UI에서).
 */
export async function setTargetWeights(
  weights: Record<string, number>,
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const holding = await getActiveHolding(supabase);
  if (!holding) return { ok: false, error: "회사를 찾을 수 없습니다." };

  // 음수·NaN 제거, 0 은 버림(설정 안 한 것으로)
  const clean: Record<string, number> = {};
  for (const [symbol, w] of Object.entries(weights)) {
    if (typeof w === "number" && w > 0 && w <= 1) clean[symbol] = w;
  }

  const { error } = await supabase
    .from("holdings")
    .update({ target_weights: clean })
    .eq("id", holding.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/rebalance");
  revalidatePath("/holdings");
  return { ok: true };
}

/**
 * 카테고리(국가/유형) 목표비중 저장 — 차원 네임스페이스 키("country:미국" 등)로 병합.
 * 다른 차원의 키는 보존하고 이 차원 키만 교체한다.
 */
export async function setCategoryTargets(
  dimension: "country" | "assetType" | "sector",
  targets: Record<string, number>,
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const holding = await getActiveHolding(supabase);
  if (!holding) return { ok: false, error: "회사를 찾을 수 없습니다." };

  // 이번 차원의 깨끗한 값(0<frac<=1)
  const clean: Record<string, number> = {};
  let sum = 0;
  for (const [label, w] of Object.entries(targets)) {
    if (typeof w === "number" && w > 0 && w <= 1) {
      clean[label] = w;
      sum += w;
    }
  }
  if (sum > 1.0001)
    return { ok: false, error: "목표 합계가 100%를 넘을 수 없습니다." };

  // 기존 맵에서 이 차원 키 제거 후 새로 추가(다른 차원 보존)
  const prefix = `${dimension}:`;
  const existing = (holding.category_targets ?? {}) as Record<string, number>;
  const merged: Record<string, number> = {};
  for (const [k, v] of Object.entries(existing))
    if (!k.startsWith(prefix)) merged[k] = v;
  for (const [label, w] of Object.entries(clean)) merged[`${prefix}${label}`] = w;

  const { error } = await supabase
    .from("holdings")
    .update({ category_targets: merged })
    .eq("id", holding.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/rebalance");
  revalidatePath("/rebalance/country");
  revalidatePath("/allocation");
  return { ok: true };
}

/**
 * 리밸런싱 계획 저장 — 계산기 결과(종목·주수)를 활성 계획으로 보관(holding 당 1개, 덮어씀).
 * 저장 시점의 누적 매수 주수를 기준선(baseBought)으로 박는다 → 이후 증가분만 진행으로 인정
 * (챌린지는 모든 매수가 "오늘"이라 날짜로는 기존 보유분과 구분 불가). 진행률은 events 에서 파생.
 */
export async function saveRebalancePlan(
  legs: { symbol: string; name: string; shares: number }[],
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const clean = legs.filter((l) => l && l.symbol && Number(l.shares) > 0);
  if (clean.length === 0)
    return { ok: false, error: "저장할 매수 계획이 없습니다." };

  const holding = await getActiveHolding(supabase);
  if (!holding) return { ok: false, error: "회사를 찾을 수 없습니다." };

  // 기준선: 현재 누적 매수 주수(활성 이벤트). 계획 저장 후 *추가* 매수만 진행으로 셈.
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id")
    .eq("holding_id", holding.id);
  const accountIds = (accounts ?? []).map((a) => a.id);
  const { data: rows } = accountIds.length
    ? await supabase.from("events").select("*").in("account_id", accountIds)
    : { data: [] };
  const events: InvestmentEvent[] = activeEventRows(rows ?? []).map((r) => ({
    type: r.type,
    symbol: r.symbol,
    quantity: r.quantity === null ? null : Number(r.quantity),
    priceOrAmount: Number(r.price_or_amount),
    feeAndTax: Number(r.fee_and_tax),
    date: r.date,
  }));
  const cum = cumulativeBought(events);

  const plan = {
    createdAt: todayKST(),
    legs: clean.map((l) => ({
      symbol: l.symbol,
      name: l.name,
      shares: Math.floor(Number(l.shares)),
      baseBought: cum[l.symbol] ?? 0,
    })),
  };

  // 새 계획으로 덮어쓰기 직전, 기존 활성 계획(있다면)을 연혁 보관용 아카이브에 append.
  const archivedPlans = archivePlan(holding.archived_plans, holding.active_plan);

  const { error } = await supabase
    .from("holdings")
    .update({ active_plan: plan, archived_plans: archivedPlans as unknown as Json })
    .eq("id", holding.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/rebalance");
  revalidatePath("/rebalance/country");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** 활성 계획 삭제(완료/취소). */
export async function clearRebalancePlan(): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const holding = await getActiveHolding(supabase);
  if (!holding) return { ok: false, error: "회사를 찾을 수 없습니다." };

  // 지우기 직전, 기존 활성 계획(있다면)을 연혁 보관용 아카이브에 append.
  const archivedPlans = archivePlan(holding.archived_plans, holding.active_plan);

  const { error } = await supabase
    .from("holdings")
    .update({ active_plan: null, archived_plans: archivedPlans as unknown as Json })
    .eq("id", holding.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/rebalance");
  revalidatePath("/rebalance/country");
  revalidatePath("/dashboard");
  return { ok: true };
}
