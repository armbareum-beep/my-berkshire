"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveHolding } from "@/lib/holdings";

/**
 * 홈 알림(재방문 후크) 확인 — 토스식 "확인하면 다음 알림".
 * 신호의 안정적 key 를 디스미스 테이블에 기록 → 다음 로드에 제외.
 * 멱등(unique holding_id+signal_key). 실패해도 다음에 재등장(데이터 손실 없음).
 */
export async function dismissHomeSignal(key: string): Promise<void> {
  if (!key) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const holding = await getActiveHolding(supabase);
  if (!holding) return;

  await supabase
    .from("home_signal_dismissals")
    .upsert(
      { holding_id: holding.id, signal_key: key },
      { onConflict: "holding_id,signal_key" },
    );
  revalidatePath("/dashboard");
}
