import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchRtmsDealsForMonth, recentDealYmds } from "@/lib/finance/rtms/client";
import { normalizeComplexName } from "@/lib/finance/rtms/match";
import { RTMS_PROPERTY_TYPES, type RtmsPropertyType } from "@/lib/finance/rtms/parse";

/**
 * 실거래가 방식 등록용 — 최근 실거래 목록 프록시.
 * GET /api/rtms/deals?lawdCd=41135&type=APT&q=판교
 *
 * data.go.kr 키(일일 쿼터)를 쓰므로 api/search 와 달리 로그인 필수(오픈 프록시 방지).
 * 최근 3개월 병렬 조회 — fetch revalidate 캐시로 같은 (유형·지역·월) 재조회는 무료.
 */

const MONTHS = 3;
const MAX_RESULTS = 100;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const lawdCd = params.get("lawdCd") ?? "";
  const type = params.get("type") ?? "";
  const q = params.get("q")?.trim() ?? "";
  if (!/^\d{5}$/.test(lawdCd) || !RTMS_PROPERTY_TYPES.includes(type as RtmsPropertyType)) {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!process.env.DATA_GO_KR_API_KEY) {
    return Response.json(
      { error: "실거래가 API 키(DATA_GO_KR_API_KEY)가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const months = await Promise.all(
      recentDealYmds(today, MONTHS).map((ymd) =>
        fetchRtmsDealsForMonth(type as RtmsPropertyType, lawdCd, ymd),
      ),
    );
    const nq = normalizeComplexName(q);
    const deals = months
      .flat()
      .filter((d) => !nq || normalizeComplexName(d.name).includes(nq))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, MAX_RESULTS);
    return Response.json({ deals });
  } catch (error) {
    console.error("[api/rtms/deals] failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "실거래 조회에 실패했습니다." },
      { status: 502 },
    );
  }
}
