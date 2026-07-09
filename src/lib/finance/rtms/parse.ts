/**
 * 국토교통부 실거래가(RTMS) XML 파서 — 순수함수.
 *
 * 4개 매매 API(아파트/연립다세대/오피스텔/분양권)의 응답을 단일 파서로 처리한다.
 * 단지명 태그만 유형별로 다르고(aptNm/mhouseNm/offiNm) 나머지 공통 필드는 동일하다.
 * XML 의존성 없이 정규식 블록 파싱(dart.ts 관례).
 */

/** RTMS 매매 API 유형: 아파트 | 연립다세대(빌라) | 오피스텔 | 아파트 분양권. */
export type RtmsPropertyType = "APT" | "RH" | "OFFI" | "SILV";

export const RTMS_PROPERTY_TYPES: RtmsPropertyType[] = ["APT", "RH", "OFFI", "SILV"];

export const RTMS_PROPERTY_TYPE_LABEL: Record<RtmsPropertyType, string> = {
  APT: "아파트",
  RH: "연립·빌라",
  OFFI: "오피스텔",
  SILV: "분양권",
};

/** 실거래 1건 — 매칭·평가에 필요한 필드만 정규화. */
export interface RtmsDeal {
  /** 단지명 원문(aptNm/mhouseNm/offiNm). */
  name: string;
  /** 전용면적(㎡). */
  area: number;
  /** 거래금액(₩). 응답의 dealAmount(만원, 콤마 포함)에서 환산. */
  amountKrw: number;
  /** 계약일(YYYY-MM-DD). */
  date: string;
  /** 층. 없으면 null(연립 일부 등). */
  floor: number | null;
  /** 법정동명(umdNm, 예: "역삼동"). */
  dong: string;
  /** 지번. 없으면 null. */
  jibun: string | null;
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  if (!m) return null;
  const v = m[1].trim();
  return v === "" ? null : v;
}

/** "142,500"(만원) → 1_425_000_000(₩). 숫자 아니면 null. */
function parseDealAmount(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n * 10_000 : null;
}

/**
 * RTMS XML 응답 파싱. resultCode 비정상이면 throw(쿼터 초과·키 오류 등).
 * 해제된 거래(cdealType/cdealDay 존재)는 제외 — 취소가로 평가하는 버그 방지.
 */
export function parseRtmsXml(xml: string): { deals: RtmsDeal[]; totalCount: number } {
  const resultCode = tag(xml, "resultCode");
  if (resultCode == null) {
    // 게이트웨이 에러(OpenAPI_ServiceResponse)는 resultCode 대신 returnReasonCode 로 온다.
    const reason = tag(xml, "returnAuthMsg") ?? tag(xml, "returnReasonCode");
    throw new Error(`RTMS 응답 형식 오류${reason ? `: ${reason}` : ""}`);
  }
  if (resultCode !== "00" && resultCode !== "000") {
    throw new Error(`RTMS 오류 ${resultCode}: ${tag(xml, "resultMsg") ?? "unknown"}`);
  }

  const deals: RtmsDeal[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    if (tag(block, "cdealType") || tag(block, "cdealDay")) continue; // 해제거래
    const name = tag(block, "aptNm") ?? tag(block, "mhouseNm") ?? tag(block, "offiNm");
    const area = Number(tag(block, "excluUseAr"));
    const amountKrw = parseDealAmount(tag(block, "dealAmount"));
    const y = tag(block, "dealYear");
    const mo = tag(block, "dealMonth");
    const d = tag(block, "dealDay");
    if (!name || !(area > 0) || amountKrw == null || !y || !mo || !d) continue;
    const floorRaw = tag(block, "floor");
    deals.push({
      name,
      area,
      amountKrw,
      date: `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`,
      floor: floorRaw != null && Number.isFinite(Number(floorRaw)) ? Number(floorRaw) : null,
      dong: tag(block, "umdNm") ?? "",
      jibun: tag(block, "jibun"),
    });
  }
  return { deals, totalCount: Number(tag(xml, "totalCount")) || deals.length };
}
