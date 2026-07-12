/**
 * 국토교통부 실거래가(RTMS) Open API 클라이언트 — 서버 전용.
 *
 * 인증키 방식(data.go.kr, 토큰 발급 없음 — dart.ts 관례). 한 달치를 페이지
 * 루프로 전부 수집하고, Next fetch 캐시(revalidate)로 같은 (유형·지역·월)
 * 재조회를 무료화한다. 실패 시 throw → 호출부가 자산별 skip/기존값 유지.
 * 자격증명: .env.local DATA_GO_KR_API_KEY (Decoding 키).
 */

import { parseRtmsXml, type RtmsDeal, type RtmsPropertyType } from "./parse";

const ENDPOINT: Record<RtmsPropertyType, string> = {
  APT: "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade",
  RH: "https://apis.data.go.kr/1613000/RTMSDataSvcRHTrade/getRTMSDataSvcRHTrade",
  OFFI: "https://apis.data.go.kr/1613000/RTMSDataSvcOffiTrade/getRTMSDataSvcOffiTrade",
  SILV: "https://apis.data.go.kr/1613000/RTMSDataSvcSilvTrade/getRTMSDataSvcSilvTrade",
};

function apiKey(): string {
  const key = process.env.DATA_GO_KR_API_KEY;
  if (!key) throw new Error("DATA_GO_KR_API_KEY required in .env.local");
  return key;
}

const PAGE_SIZE = 1000;
// 시군구 1개월 매매가 5천 건을 넘는 경우는 없다시피 하므로 폭주 방지용 상한.
const MAX_PAGES = 5;
// 실거래 신고는 계약 후 30일 이내 → 한 달이면 데이터가 사실상 확정. 6시간 캐시.
const REVALIDATE_SEC = 21_600;

/** 한 달치 실거래 전체(해제거래 제외). lawdCd=법정동 5자리, dealYmd=YYYYMM. */
export async function fetchRtmsDealsForMonth(
  type: RtmsPropertyType,
  lawdCd: string,
  dealYmd: string,
): Promise<RtmsDeal[]> {
  const all: RtmsDeal[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url =
      `${ENDPOINT[type]}?serviceKey=${encodeURIComponent(apiKey())}` +
      `&LAWD_CD=${lawdCd}&DEAL_YMD=${dealYmd}&pageNo=${page}&numOfRows=${PAGE_SIZE}`;
    const res = await fetch(url, { next: { revalidate: REVALIDATE_SEC } });
    if (!res.ok) throw new Error(`RTMS ${type} HTTP ${res.status}`);
    const { deals, totalCount } = parseRtmsXml(await res.text());
    all.push(...deals);
    if (page * PAGE_SIZE >= totalCount) break;
  }
  return all;
}

/** 최근 n개월의 DEAL_YMD(YYYYMM) 목록, 당월부터 최신순. today=YYYY-MM-DD. */
export function recentDealYmds(today: string, months: number): string[] {
  const [y, m] = today.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}
