import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./supabase/database.types";

export type Holding = Database["public"]["Tables"]["holdings"]["Row"];
export const ACTIVE_HOLDING_COOKIE = "active_holding";

/** 쿠키가 가리키는 본인 holding. 없거나 유효하지 않으면 가장 먼저 만든 회사로 폴백. */
export async function getActiveHolding(
  supabase: SupabaseClient<Database>,
): Promise<Holding | null> {
  const activeId = (await cookies()).get(ACTIVE_HOLDING_COOKIE)?.value;
  if (activeId) {
    const { data } = await supabase
      .from("holdings")
      .select("*")
      .eq("id", activeId)
      .maybeSingle();
    if (data) return data;
  }

  const { data } = await supabase
    .from("holdings")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data;
}

/** 기존 호출부 호환용. 이제 '대표'는 현재 활성 회사를 의미한다. */
export const getPrimaryHolding = getActiveHolding;

/** 서버 액션에서만 호출. 다음 요청부터 새 활성 회사를 사용한다. */
export async function setActiveHoldingCookie(holdingId: string): Promise<void> {
  (await cookies()).set(ACTIVE_HOLDING_COOKIE, holdingId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
