import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fetchRtmsDealsForMonth } from "@/lib/finance/rtms/client";
import { findLatestComparableDeal } from "@/lib/finance/rtms/refresh";
import type { RtmsDeal, RtmsPropertyType } from "@/lib/finance/rtms/parse";
import { todayKST } from "@/lib/date";

/**
 * 실거래가(거래사례비교법) 자산 월간 갱신 cron — 매월 5일(전월 신고분 축적 후).
 * 계약은 sync-kis-master 와 동일:
 *  · Authorization: Bearer {CRON_SECRET} 불일치 시 403(vercel.json 이 자동 주입)
 *  · 그 외에는 성공/실패 모두 HTTP 200 — Vercel 재시도 오인 방지, 개별 실패는 skip.
 * 같은 (유형·지역·월) 데이터는 메모캐시로 공유해 API 쿼터를 아낀다.
 */
export const maxDuration = 300;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 403 });
  }

  const start = Date.now();
  try {
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
    // 보유 중(미매도·미삭제) 실거래가 방식 자산 전체 — service role(RLS 우회).
    const { data: assets, error } = await supabase
      .from("manual_assets")
      .select(
        "id, rtms_lawd_cd, rtms_property_type, rtms_complex_name, rtms_exclusive_area",
      )
      .eq("valuation_method", "transaction_comp")
      .is("deleted_at", null)
      .is("sale_at", null);
    if (error) throw error;

    // (유형:지역:월) → 거래목록 메모캐시. 같은 단지·지역 자산들이 월 데이터를 공유.
    const monthCache = new Map<string, Promise<RtmsDeal[]>>();
    const today = todayKST();
    let updated = 0;
    let noDeal = 0;
    let failed = 0;

    for (const a of assets ?? []) {
      if (
        !a.rtms_lawd_cd ||
        !a.rtms_property_type ||
        !a.rtms_complex_name ||
        a.rtms_exclusive_area == null
      ) {
        failed++;
        continue;
      }
      const type = a.rtms_property_type as RtmsPropertyType;
      const lawdCd = a.rtms_lawd_cd;
      try {
        const deal = await findLatestComparableDeal({
          type,
          lawdCd,
          complexName: a.rtms_complex_name,
          area: Number(a.rtms_exclusive_area),
          today,
          loadMonth: (ymd) => {
            const key = `${type}:${lawdCd}:${ymd}`;
            let p = monthCache.get(key);
            if (!p) {
              p = fetchRtmsDealsForMonth(type, lawdCd, ymd);
              monthCache.set(key, p);
            }
            return p;
          },
        });
        if (!deal) {
          noDeal++; // 6개월 무거래 → 기존 평가액 유지(의도된 폴백)
          continue;
        }
        const { error: upErr } = await supabase
          .from("manual_assets")
          .update({
            current_value: deal.amountKrw,
            valued_at: deal.date,
            valuation_source: "국토부 실거래가",
          })
          .eq("id", a.id);
        if (upErr) throw upErr;
        updated++;
      } catch (e) {
        // 쿼터 초과·일시 오류 등 — 해당 자산만 skip, 기존값 유지.
        console.error(`[cron/refresh-rtms] asset ${a.id} failed:`, e);
        failed++;
      }
    }

    return Response.json({
      ok: true,
      total: assets?.length ?? 0,
      updated,
      noDeal,
      failed,
      durationMs: Date.now() - start,
    });
  } catch (error) {
    // Vercel 재시도 방지 — 실패도 200으로 응답하고 원인은 로그·바디에 남긴다.
    console.error("[cron/refresh-rtms-valuations] failed:", error);
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
