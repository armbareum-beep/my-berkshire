/**
 * 지수 지표 셀의 표시 상태 — 값/정보 없음/데이터 준비 중을 정직하게 구분(헌장 II).
 *
 *  · value       : 실제 값 있음
 *  · unavailable : 어떤 출처에도 없음(영구) → "정보 없음"
 *  · pending     : 출처는 있으나 미동기화(한국 지수 KRX 캐시 빔) → "데이터 준비 중"
 *
 * Forward PER 은 예측값이고 국내·미국 모두 신뢰할 출처가 없어 지표에서 제거(스펙 §US2).
 */

export type MetricStatus = "value" | "unavailable" | "pending";

export interface MetricContext {
  /** 한국 지수(^KS11·^KQ11) 여부. */
  isKoreaIndex: boolean;
  /** 한국 지수의 KRX 캐시 행 존재 여부. */
  krxAvailable: boolean;
}

/**
 * 셀 상태 산출.
 * @param value 지표 값(없으면 null)
 * @param krxSourced 이 지표가 한국 지수에서 KRX 캐시 전용 출처인지(PER·PBR·배당=true, ROE=false)
 */
export function metricStatus(
  value: number | null,
  ctx: MetricContext,
  krxSourced: boolean,
): MetricStatus {
  if (value != null) return "value";
  if (ctx.isKoreaIndex && krxSourced && !ctx.krxAvailable) return "pending";
  return "unavailable";
}

/** 값이 없을 때 셀에 표기할 텍스트. */
export function statusText(status: MetricStatus): string {
  return status === "pending" ? "데이터 준비 중" : "정보 없음";
}
