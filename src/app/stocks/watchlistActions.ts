"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { upsertSecurities } from "@/lib/securities";
import { getActiveHolding } from "@/lib/holdings";

type Result = { ok: true } | { ok: false; error: string };

async function getHoldingId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  return (await getActiveHolding(supabase))?.id ?? null;
}

/** 관심종목 추가/제거 토글. */
export async function toggleWatch(
  symbol: string,
  watched: boolean,
  name?: string,
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };
  if (!symbol) return { ok: false, error: "종목이 올바르지 않습니다." };

  const holdingId = await getHoldingId(supabase);
  if (!holdingId) return { ok: false, error: "회사를 찾을 수 없습니다." };

  if (watched) {
    const { error } = await supabase
      .from("watchlist")
      .delete()
      .eq("holding_id", holdingId)
      .eq("symbol", symbol);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("watchlist")
      .upsert(
        { holding_id: holdingId, symbol },
        { onConflict: "holding_id,symbol" },
      );
    if (error) return { ok: false, error: error.message };
    // 이름을 securities 에 적재 → 관심종목 목록·다른 화면에서 코드 대신 이름 표시.
    if (name) await upsertSecurities(supabase, [{ symbol, name }]);
  }

  revalidatePath(`/stocks/${symbol}`);
  revalidatePath("/search");
  return { ok: true };
}
