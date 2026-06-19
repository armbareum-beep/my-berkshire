/**
 * 섹터(산업) 태그 — 자산배분·리밸런싱의 산업 차원("반도체에 쏠렸나").
 *
 * 출처(무료 공시 API 재사용·crumb 불필요):
 *   · 한국 6자리 = DART company.json 의 induty_code(KSIC) → 2자리 대분류로 섹터.
 *   · 미국 = EDGAR submissions 의 sicDescription(자유 문자열) → 키워드로 섹터.
 *   · 코인·원자재·현금 = 섹터 개념 없음(자산유형 태그로 충분) → null.
 *
 * 섹터 라벨은 GICS식 한국어 12종으로 통일. 매핑은 규칙 기반(추정 아님, 토큰 0).
 * 한 번 조회하면 securities.sector 에 저장(backfill) — 이후 즉시 읽음. 인터페이스 seam.
 */

import { getIndutyCodeKR } from "./dart";
import { getSicDescriptionUS } from "./edgar";
import { isCrypto } from "../securities";

export const UNKNOWN_SECTOR = "미분류";

/** KSIC 2자리 대분류 → 섹터. (한국표준산업분류 기준 대표 매핑) */
export function sectorFromKsic(code: string): string | null {
  const major = Number(code.slice(0, 2));
  if (!Number.isFinite(major)) return null;
  // 농림어업·광업
  if (major >= 1 && major <= 3) return "필수소비재";
  if (major >= 5 && major <= 8) return "에너지";
  // 제조업(10~34) — 세분
  if (major === 10 || major === 11 || major === 12) return "필수소비재"; // 식료품·음료·담배
  if (major === 13 || major === 14 || major === 15) return "경기소비재"; // 섬유·의복·가죽
  if (major === 20) return "소재"; // 화학
  if (major === 21) return "헬스케어"; // 의료용물질·의약품
  if (major === 22 || major === 23) return "소재"; // 고무·플라스틱·비금속광물
  if (major === 24 || major === 25) return "소재"; // 1차금속·금속가공
  if (major === 26) return "IT·반도체"; // 전자부품·컴퓨터·영상·통신장비
  if (major === 27) return "헬스케어"; // 의료·정밀·광학기기
  if (major === 28) return "산업재"; // 전기장비
  if (major === 29) return "산업재"; // 기계·장비
  if (major === 30 || major === 31) return "경기소비재"; // 자동차·기타운송장비
  if (major >= 16 && major <= 34) return "산업재"; // 그 외 제조업
  // 전기·가스·수도
  if (major === 35 || major === 36) return "유틸리티";
  // 건설
  if (major === 41 || major === 42) return "산업재";
  // 도소매
  if (major >= 45 && major <= 47) return "경기소비재";
  // 운수·창고
  if (major >= 49 && major <= 52) return "산업재";
  // 숙박·음식
  if (major === 55 || major === 56) return "경기소비재";
  // 정보통신(출판·방송·통신·소프트웨어)
  if (major >= 58 && major <= 63) return "커뮤니케이션";
  // 금융·보험
  if (major >= 64 && major <= 66) return "금융";
  // 부동산
  if (major === 68) return "부동산";
  return null;
}

/** SIC 설명(영문 자유 문자열) → 섹터. 구체 키워드 우선(순서 중요). */
export function sectorFromSic(desc: string): string | null {
  const d = desc.toLowerCase();
  const has = (...ws: string[]) => ws.some((w) => d.includes(w));
  if (has("semiconductor")) return "IT·반도체";
  if (has("computer", "software", "data processing", "prepackaged", "information technology"))
    return "IT·반도체";
  if (has("pharmaceutical", "biological", "medicinal", "in vitro", "surgical", "medical", "health", "diagnostic"))
    return "헬스케어";
  // 부동산을 금융보다 먼저 — REIT 의 "investment trust"가 금융으로 오분류되지 않게.
  if (has("real estate", "reit", "land subdivid"))
    return "부동산";
  if (has("bank", "insurance", "investment", "security broker", "finance", "credit", "savings"))
    return "금융";
  if (has("petroleum", "crude", "oil", "natural gas", "coal", "drilling", "energy"))
    return "에너지";
  if (has("electric", "gas distribution", "water supply", "utilit", "sanitary"))
    return "유틸리티";
  if (has("telephone", "television", "broadcast", "communication", "advertising", "publishing", "motion picture"))
    return "커뮤니케이션";
  if (has("food", "beverage", "grocery", "household", "tobacco", "soap", "agricultur"))
    return "필수소비재";
  if (has("motor vehicle", "automobile", "retail", "apparel", "restaurant", "hotel", "store", "consumer"))
    return "경기소비재";
  if (has("chemical", "steel", "metal", "mining", "paper", "lumber", "plastic", "rubber"))
    return "소재";
  if (has("machinery", "industrial", "construction", "transportation", "aircraft", "manufactur", "electronic", "equipment"))
    return "산업재";
  return null;
}

/**
 * 한 종목의 섹터(한국어 라벨). 못 알아내면 null(호출부가 "미분류"로 폴백).
 * 코인·원자재는 섹터 개념이 없어 처리하지 않음(호출부가 자산유형으로 분류).
 */
export async function fetchSector(symbol: string): Promise<string | null> {
  if (isCrypto(symbol)) return null;
  if (/^\d{6}$/.test(symbol)) {
    const code = await getIndutyCodeKR(symbol);
    return code ? sectorFromKsic(code) : null;
  }
  const desc = await getSicDescriptionUS(symbol);
  return desc ? sectorFromSic(desc) : null;
}
