"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  LIABILITY_KINDS,
  type LiabilityKind,
} from "@/lib/finance/liabilities";
import {
  MANUAL_ASSET_KINDS,
  type ManualAssetKind,
} from "@/lib/finance/realAssets";
import { getActiveHolding } from "@/lib/holdings";

type Result = { ok: true } | { ok: false; error: string };

export interface LiabilityInput {
  name: string;
  kind: LiabilityKind;
  /** 현재 잔액(₩). */
  principal: number;
  /** 연이율(%, 사용자 입력 단위). 내부에 소수로 저장. */
  interestPct: number;
  /** 차입일(YYYY-MM-DD) 또는 빈 문자열. */
  startedAt?: string;
}

/** 활성 holding id 조회(부채는 회사 레벨 재무상태표 항목). */
async function getHoldingId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  return (await getActiveHolding(supabase))?.id ?? null;
}

function validate(input: LiabilityInput): string | null {
  if (!input.name.trim()) return "부채 이름을 입력하세요.";
  if (!LIABILITY_KINDS.includes(input.kind)) return "부채 종류가 올바르지 않습니다.";
  if (!(input.principal >= 0)) return "잔액이 올바르지 않습니다.";
  if (!(input.interestPct >= 0)) return "이자율이 올바르지 않습니다.";
  return null;
}

export async function addLiability(input: LiabilityInput): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };

  const holdingId = await getHoldingId(supabase);
  if (!holdingId) return { ok: false, error: "회사를 찾을 수 없습니다." };

  const { error } = await supabase.from("liabilities").insert({
    holding_id: holdingId,
    name: input.name.trim(),
    kind: input.kind,
    principal: input.principal,
    interest_rate: input.interestPct / 100, // % → 소수
    started_at: input.startedAt || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/networth");
  revalidatePath("/dashboard"); // 홈 레버리지 배너 갱신
  return { ok: true };
}

export async function updateLiability(
  id: string,
  input: LiabilityInput,
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };

  // RLS 가 소유권을 보장하므로 id 로만 갱신.
  const { error } = await supabase
    .from("liabilities")
    .update({
      name: input.name.trim(),
      kind: input.kind,
      principal: input.principal,
      interest_rate: input.interestPct / 100,
      started_at: input.startedAt || null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/networth");
  revalidatePath("/dashboard"); // 홈 레버리지 배너 갱신
  return { ok: true };
}

export async function deleteLiability(id: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  // 소프트 삭제(events 와 동일 관례) — 기록 보존.
  const { error } = await supabase
    .from("liabilities")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/networth");
  revalidatePath("/dashboard"); // 홈 레버리지 배너 갱신
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// 수기 평가 자산(부동산·실물·대체) — "사업부". 순자산에만 합산, 투자 XIRR 제외.
// ─────────────────────────────────────────────────────────────

export interface ManualAssetInput {
  name: string;
  kind: ManualAssetKind;
  /** 현재 평가액(₩, 수기). */
  currentValue: number;
  /** 취득가(₩) 또는 null/undefined. */
  acquiredPrice?: number | null;
  /** 취득일(YYYY-MM-DD) 또는 빈 문자열. */
  acquiredAt?: string;
  note?: string;
}

function validateAsset(input: ManualAssetInput): string | null {
  if (!input.name.trim()) return "자산 이름을 입력하세요.";
  if (!MANUAL_ASSET_KINDS.includes(input.kind))
    return "자산 종류가 올바르지 않습니다.";
  if (!(input.currentValue >= 0)) return "평가액이 올바르지 않습니다.";
  if (input.acquiredPrice != null && !(input.acquiredPrice >= 0))
    return "취득가가 올바르지 않습니다.";
  return null;
}

export async function addManualAsset(
  input: ManualAssetInput,
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const invalid = validateAsset(input);
  if (invalid) return { ok: false, error: invalid };

  const holdingId = await getHoldingId(supabase);
  if (!holdingId) return { ok: false, error: "회사를 찾을 수 없습니다." };

  const { error } = await supabase.from("manual_assets").insert({
    holding_id: holdingId,
    name: input.name.trim(),
    kind: input.kind,
    current_value: input.currentValue,
    acquired_price: input.acquiredPrice ?? null,
    acquired_at: input.acquiredAt || null,
    note: input.note?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/networth");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateManualAsset(
  id: string,
  input: ManualAssetInput,
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const invalid = validateAsset(input);
  if (invalid) return { ok: false, error: invalid };

  // RLS 가 소유권 보장 → id 로만 갱신.
  const { error } = await supabase
    .from("manual_assets")
    .update({
      name: input.name.trim(),
      kind: input.kind,
      current_value: input.currentValue,
      acquired_price: input.acquiredPrice ?? null,
      acquired_at: input.acquiredAt || null,
      note: input.note?.trim() || null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/networth");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteManualAsset(id: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { error } = await supabase
    .from("manual_assets")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/networth");
  revalidatePath("/dashboard");
  return { ok: true };
}
