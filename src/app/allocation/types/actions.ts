"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveHolding } from "@/lib/holdings";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import { loadSecurityMeta } from "@/lib/securities";
import { isCashKey } from "@/lib/targetLens";
import {
  isAssetClass,
  readAssetClassOverrides,
  suggestAssetClass,
  type AssetClass,
  type AssetClassOverrides,
} from "@/lib/assetClass";
import type { Json } from "@/lib/supabase/database.types";

type Result = { ok: true } | { ok: false; error: string };

/**
 * 분류를 바꾸면 **유형을 읽는 화면 전부**가 옛 숫자를 들고 있게 된다. 국채 ETF 하나를
 * 채권으로 옮기면 ETF 합·채권 합·배분 순위가 동시에 달라지기 때문이다.
 */
function revalidateClassification() {
  revalidatePath("/allocation", "layout");
  revalidatePath("/allocate");
  revalidatePath("/dashboard");
  revalidatePath("/ranking");
}

async function saveOverrides(
  overrides: AssetClassOverrides,
): Promise<Result & { saved?: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const holding = await getActiveHolding(supabase);
  if (!holding) return { ok: false, error: "회사를 찾을 수 없습니다." };

  const { error } = await supabase
    .from("holdings")
    .update({ asset_type_overrides: overrides as Json })
    .eq("id", holding.id);
  if (error) return { ok: false, error: "저장하지 못했어요. 다시 시도해 주세요." };

  revalidateClassification();
  return { ok: true, saved: Object.keys(overrides).length };
}

/**
 * 종목 몇 개의 자산유형을 한 번에 정한다. `next` 가 null 이면 덮어쓰기를 **지운다**
 * (= 카탈로그 원래 값으로 돌아간다). 지우기와 "ETF 로 정하기"는 다른 뜻이다 —
 * 앞은 자동에 맡기는 것이고 뒤는 사용자가 확정한 것이다.
 */
export async function setAssetClass(
  symbols: string[],
  next: AssetClass | null,
): Promise<Result> {
  const targets = symbols.filter(Boolean);
  if (targets.length === 0) return { ok: false, error: "고른 종목이 없어요." };
  if (next != null && !isAssetClass(next))
    return { ok: false, error: "알 수 없는 자산유형입니다." };

  const supabase = await createClient();
  const holding = await getActiveHolding(supabase);
  if (!holding) return { ok: false, error: "회사를 찾을 수 없습니다." };

  const overrides = readAssetClassOverrides(holding.asset_type_overrides);
  for (const symbol of targets) {
    if (next == null) delete overrides[symbol];
    else overrides[symbol] = next;
  }
  return saveOverrides(overrides);
}

/**
 * 제안을 **한 번에** 적용한다 — 이 화면의 주 동선이다.
 *
 * 제안 목록은 화면이 보낸 걸 믿지 않고 **서버에서 다시 계산한다.** 화면과 서버의 규칙이
 * 갈리면 사용자가 못 본 종목의 유형이 바뀌는데, 그건 조용히 값을 바꾸는 것과 같다.
 */
export async function applyAllSuggestions(): Promise<
  Result & { applied?: number }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const portfolio = await getPortfolio(supabase);
  if (!portfolio) return { ok: false, error: "회사를 찾을 수 없습니다." };

  const symbols = classifiableSymbols(portfolio);
  const meta = await loadSecurityMeta(supabase, symbols);
  const overrides = readAssetClassOverrides(
    portfolio.holding.asset_type_overrides,
  );

  let applied = 0;
  for (const symbol of symbols) {
    const m = meta[symbol];
    if (!m) continue;
    // 이미 사용자가 정한 종목은 건너뛴다 — 제안이 사람의 판단을 덮으면 안 된다.
    if (overrides[symbol]) continue;
    const next = suggestAssetClass(m.name, m.assetType);
    if (next) {
      overrides[symbol] = next;
      applied += 1;
    }
  }
  if (applied === 0) return { ok: true, applied: 0 };

  const res = await saveOverrides(overrides);
  return res.ok ? { ok: true, applied } : res;
}

/** 분류 대상 = 보유 종목 ∪ 목표비중이 잡힌 종목(아직 안 산 것도 유형이 필요하다). */
function classifiableSymbols(
  portfolio: NonNullable<Awaited<ReturnType<typeof getPortfolio>>>,
): string[] {
  const data = computeDashboard(portfolio, "KRW");
  const stored = (portfolio.holding.target_weights ?? {}) as Record<
    string,
    unknown
  >;
  return [
    ...new Set([
      ...data.allocation.map((a) => a.symbol),
      ...Object.keys(stored).filter((k) => !isCashKey(k)),
    ]),
  ];
}
