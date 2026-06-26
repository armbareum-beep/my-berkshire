"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveHolding } from "@/lib/holdings";

export async function renameActiveCompany(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("회사명을 입력하세요.");
  if (name.length > 40) throw new Error("회사명은 40자 이내로 입력하세요.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const holding = await getActiveHolding(supabase);
  if (!holding) throw new Error("회사를 찾을 수 없습니다.");

  const { error } = await supabase
    .from("holdings")
    .update({ name })
    .eq("id", holding.id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/company");
  revalidatePath("/dashboard");
}

// ── 컴퍼니(CEO) 레이어 ──────────────────────────────────────────
// members = 가족 한 사람의 계좌 묶음. 연결 지표에 영향 → 관련 경로 재검증.

type Result = { ok: true } | { ok: false; error: string };

function revalidateMember(): void {
  revalidatePath("/company");
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  revalidatePath("/networth");
  revalidatePath("/allocation");
}

/** 컴퍼니 추가 — sort_order는 현재 최대+1. */
export async function createMember(
  name: string,
  emoji?: string | null,
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "컴퍼니 이름을 입력하세요." };

  const holding = await getActiveHolding(supabase);
  if (!holding) return { ok: false, error: "회사를 찾을 수 없습니다." };

  const { data: last } = await supabase
    .from("members")
    .select("sort_order")
    .eq("holding_id", holding.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = (last?.sort_order ?? -1) + 1;

  const { error } = await supabase.from("members").insert({
    holding_id: holding.id,
    name: trimmed,
    emoji: emoji?.trim() || null,
    sort_order: sortOrder,
  });
  if (error) return { ok: false, error: error.message };

  revalidateMember();
  return { ok: true };
}

/** 컴퍼니 이름·이모지 수정. RLS가 본인 holding 소속만 허용. */
export async function updateMember(
  id: string,
  name: string,
  emoji?: string | null,
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "컴퍼니 이름을 입력하세요." };

  const { error } = await supabase
    .from("members")
    .update({ name: trimmed, emoji: emoji?.trim() || null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidateMember();
  return { ok: true };
}

/** 컴퍼니 삭제 — 계좌는 보존(FK on delete set null=미지정). 마지막 컴퍼니는 삭제 불가. */
export async function deleteMember(id: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { data: member } = await supabase
    .from("members")
    .select("id, holding_id")
    .eq("id", id)
    .maybeSingle();
  if (!member) return { ok: false, error: "컴퍼니를 찾을 수 없습니다." };

  const { count } = await supabase
    .from("members")
    .select("id", { count: "exact", head: true })
    .eq("holding_id", member.holding_id);
  if ((count ?? 0) <= 1)
    return { ok: false, error: "마지막 컴퍼니는 삭제할 수 없습니다." };

  const { error } = await supabase.from("members").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidateMember();
  return { ok: true };
}

/** 합산 포함/제외 토글 — included=false면 연결 재무에서 그 컴퍼니 계좌 제외. */
export async function setMemberIncluded(
  id: string,
  included: boolean,
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { error } = await supabase
    .from("members")
    .update({ included })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidateMember();
  return { ok: true };
}
