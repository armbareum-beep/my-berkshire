/**
 * 과거 앵커 — 미래 가정을 입력할 때 **곁에 놓을 사실**.
 *
 * ## 왜 앵커만 주고 값은 안 채우나
 *
 * 이 앱의 분업은 명확하다(PRD v0.3 §3.1).
 *
 * > 기업 선택은 인간의 영역이고, 가격과 자본배분은 시스템의 영역이다.
 *
 * 과거 실적은 **사실**이라 앱이 가져온다. 미래 성장률과 종료 배수는 **판단**이라 사람이 넣는다.
 * 그래서 여기서 만드는 값은 전부 "지난 N년은 이랬다"이고, 입력칸의 기본값으로 쓰지 않는다.
 * 과거 성장률을 미리 채워두면 사용자가 그대로 저장해버려 **앱이 예측한 것과 같아진다.**
 *
 * 힌트로만 쓰고 판단은 넘긴다 — 그게 "가짜 정밀 금지"의 실천이다.
 */

/** 과거 이익 성장률 — 실제로 일어난 일. */
export interface GrowthAnchor {
  /** 연평균 성장률(소수). */
  cagr: number;
  fromYear: number;
  toYear: number;
  /** 몇 년치인가(= toYear − fromYear). */
  years: number;
}

/** 배수 밴드 — 시장이 이 회사에 실제로 매겨온 값의 범위. */
export interface MultipleBand {
  avg: number;
  min: number;
  max: number;
  /** 표본 연수. */
  count: number;
}

/**
 * 연도별 주당이익에서 CAGR. 오래된 해 → 최근 해 순서는 상관없다(연도로 정렬한다).
 *
 * 시작·끝 중 하나라도 0 이하면 **null 을 낸다.** 적자에서 흑자로 돌아선 구간의 "성장률"은
 * 수학적으로 계산은 되지만 의미가 없어서(−100억 → +10억이 몇 %인가?) 숫자를 만들지 않는다.
 */
export function epsGrowthAnchor(
  points: { year: number; eps: number | null | undefined }[],
): GrowthAnchor | null {
  const clean = points
    .filter(
      (p): p is { year: number; eps: number } =>
        Number.isInteger(p.year) &&
        p.eps != null &&
        Number.isFinite(p.eps) &&
        p.eps > 0,
    )
    .sort((a, b) => a.year - b.year);

  if (clean.length < 2) return null;

  const first = clean[0];
  const last = clean[clean.length - 1];
  const years = last.year - first.year;
  if (years <= 0) return null;

  return {
    cagr: Math.pow(last.eps / first.eps, 1 / years) - 1,
    fromYear: first.year,
    toYear: last.year,
    years,
  };
}

/**
 * 배수 밴드(평균·최저·최고). 표본이 2개 미만이면 null —
 * 한 해짜리 "평균"은 밴드가 아니라 그냥 그 해 값이라 오해를 부른다.
 */
export function multipleBand(
  values: Iterable<number>,
): MultipleBand | null {
  const clean = [...values].filter((v) => Number.isFinite(v) && v > 0);
  if (clean.length < 2) return null;

  const sum = clean.reduce((s, v) => s + v, 0);
  return {
    avg: sum / clean.length,
    min: Math.min(...clean),
    max: Math.max(...clean),
    count: clean.length,
  };
}
