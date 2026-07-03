/**
 * 운용 스타일 진단 — 기존 events·태그에서 파생(새 입력 없음).
 * 다차원 프로파일(집중도·회전율·현금·해외·배당)로 점수화하고 대표 아키타입을 고른다.
 * 가치투자·안티과매매 브랜드와 연결.
 *
 * 모든 비교는 비율이라 표시 통화와 무관(events 는 ₩ 기준).
 */
import type { Portfolio } from "./portfolio";
import type { DashboardData } from "./dashboard";
import { totalDeposits } from "./finance/valuation";
import { daysSince } from "./finance/xirr";
import { assetTypeOf, countryOf, type SecurityRecord } from "./securities";
import { findCatalogItem } from "./finance/catalog";
import { todayKST } from "./date";

export interface StyleDimension {
  key: string;
  label: string;
  /** 0~1 프로파일 점수(막대). */
  score: number;
  /** 사람이 읽는 값(예: "45%", "3개월"). */
  display: string;
  /** 점수 근거 한 줄. */
  evidence?: string;
  /** 양방향 스펙트럼 양끝. 있으면 점수 막대가 아니라 위치로 표시. */
  lowLabel?: string;
  highLabel?: string;
  /** 이 축을 해석할 데이터가 충분한지. */
  available?: boolean;
  /** 관측기간·분류 커버리지 기반 0~1 신뢰도. */
  confidence?: number;
}

export interface StyleArchetype {
  key: string;
  label: string;
  emoji: string;
  score: number;
  tagline: string;
}

/** 투자 규율 점수 등급(버핏式). tone 으로 색·톤 결정. */
export interface StyleGrade {
  label: string;
  emoji: string;
  tone: "good" | "ok" | "warn";
}

export interface StyleResult {
  insufficient: boolean;
  emoji: string;
  label: string;
  tagline: string;
  /** 한 줄 요약 지표(매매·종목수·평균보유). */
  summary: string;
  /** 프로파일 막대(집중도·회전율·현금·해외·배당). */
  dimensions: StyleDimension[];
  primaryStyle: StyleArchetype | null;
  secondaryStyles: StyleArchetype[];
  /** 강한 두 축이 선별 조합에 해당할 때만 부여되는 희소 칭호. */
  compositeStyle: StyleArchetype | null;
  insight?: string;
  confidence: {
    score: number;
    label: "낮음" | "보통" | "높음";
    summary: string;
  } | null;
  warning?: string;
  /**
   * 투자 규율 점수(0~100, 버핏式) — 활동이 아니라 규율을 보상.
   * 인내·저회전·저비용·저레버리지의 가중 평균. insufficient 면 null.
   */
  score: number | null;
  grade: StyleGrade | null;
  /** 규율 점수 구성요소(막대=좋을수록 참, display=실제 지표). */
  subScores: StyleDimension[];
}

/** 규율 점수 → 등급(자본배분가의 길). */
function gradeOf(score: number): StyleGrade {
  if (score >= 85) return { label: "자본배분의 달인", emoji: "🎩", tone: "good" };
  if (score >= 70)
    return { label: "규율 있는 장기투자가", emoji: "🌳", tone: "good" };
  if (score >= 55) return { label: "성장하는 투자가", emoji: "🌱", tone: "ok" };
  return { label: "과매매 주의", emoji: "⚠️", tone: "warn" };
}

/**
 * 등급 서열 — gradeOf가 실제로 반환하는 라벨 문자열과 정확히 일치해야 한다(진실원천은 코드).
 * 등급업 비교(033 US3)에만 쓰인다. 미지 라벨(콜드스타트 등)은 -1(비교 불가).
 */
const GRADE_ORDER = [
  "과매매 주의",
  "성장하는 투자가",
  "규율 있는 장기투자가",
  "자본배분의 달인",
];
export function gradeRank(label: string): number {
  return GRADE_ORDER.indexOf(label);
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const pct = (r: number) => `${Math.round(r * 100)}%`;

export function computeStyle(
  p: Portfolio,
  d: DashboardData,
  debtKrw = 0,
  /** 자본배분 계획 준수율(0~1). 계획 없으면 null → 점수에서 제외. */
  planAdherence: number | null = null,
  securityMeta: Record<string, SecurityRecord> = {},
): StyleResult {
  const today = todayKST();
  const foundedAt = p.holding.founded_at;
  const days = daysSince(foundedAt, today);
  const events = p.events;

  const tradeCount = events.filter(
    (e) => e.type === "BUY" || e.type === "SELL",
  ).length;

  if (d.allocation.length === 0 || tradeCount === 0) {
    return {
      insufficient: true,
      emoji: "🧭",
      label: "스타일 분석 대기",
      tagline: "거래가 쌓이면 당신의 운용 스타일을 진단해 드려요.",
      summary: "",
      dimensions: [],
      primaryStyle: null,
      secondaryStyles: [],
      compositeStyle: null,
      confidence: null,
      score: null,
      grade: null,
      subScores: [],
    };
  }

  const invested = Number(p.holding.initial_valuation) + totalDeposits(events);

  // 회전율: 매도금액/투자원금 + 연환산 매매빈도(설립 60일↑) 중 큰 쪽
  const sellGross = events
    .filter((e) => e.type === "SELL" && e.quantity)
    .reduce((s, e) => s + (e.quantity as number) * e.priceOrAmount, 0);
  const sellTurnover = invested > 0 ? sellGross / invested : 0;
  const postFoundingTrades = events.filter(
    (e) => (e.type === "BUY" || e.type === "SELL") && e.date > foundedAt,
  ).length;
  const tradesPerYear = days >= 60 ? (postFoundingTrades * 365) / days : 0;
  const activity = clamp01(Math.max(sellTurnover, tradesPerYear / 24)); // 월 2회면 만점

  // 집중도: 최대 종목 비중(주식 합 대비)
  const stockTotal = d.allocation.reduce((s, a) => s + a.value, 0);
  const topWeight =
    stockTotal > 0 ? Math.max(...d.allocation.map((a) => a.value)) / stockTotal : 0;
  const holdingsCount = d.allocation.length;

  const cashWeight = clamp01(d.cashWeight ?? 0);

  // 해외 비중: 국가 태그(6자리=한국, 그 외=해외)
  const overseasValue = d.allocation
    .filter((a) => countryOf(a.symbol) !== "한국")
    .reduce((s, a) => s + a.value, 0);
  const overseasWeight = stockTotal > 0 ? overseasValue / stockTotal : 0;

  // 배당 성향: 누적 배당을 관측기간으로 연환산 / 투자원금 (5%면 만점)
  const dividendTotal = events
    .filter((e) => e.type === "DIVIDEND")
    .reduce((s, e) => s + e.priceOrAmount, 0);
  const dividendRatio = invested > 0 ? dividendTotal / invested : 0;
  const annualizedDividendRatio =
    days >= 90 ? dividendRatio * (365 / Math.max(days, 1)) : dividendRatio;
  const dividendScore = clamp01(annualizedDividendRatio / 0.05);

  // 평균 보유기간(평가액 가중)
  let weightedDays = 0;
  for (const a of d.allocation) {
    const firstBuy = events
      .filter((e) => e.type === "BUY" && e.symbol === a.symbol)
      .reduce<string | null>(
        (min, e) => (min === null || e.date < min ? e.date : min),
        null,
      );
    const age = firstBuy ? daysSince(firstBuy, today) : 0;
    weightedDays += age * (stockTotal > 0 ? a.value / stockTotal : 0);
  }
  const avgHoldingDays = Math.round(weightedDays);
  const periodLabel =
    avgHoldingDays >= 60
      ? `${Math.round(avgHoldingDays / 30)}개월`
      : `${avgHoldingDays}일`;

  const etfValue = d.allocation.reduce((sum, allocation) => {
    const meta = securityMeta[allocation.symbol];
    const type =
      meta?.assetType ??
      findCatalogItem(allocation.symbol)?.assetType ??
      assetTypeOf(null, allocation.symbol);
    return sum + (type === "ETF" ? allocation.value : 0);
  }, 0);
  const innovativeSector =
    /(기술|테크|반도체|소프트웨어|바이오|헬스케어|정보기술)/i;
  const innovationValue = d.allocation.reduce((sum, allocation) => {
    const sector = securityMeta[allocation.symbol]?.sector ?? "";
    return sum + (innovativeSector.test(sector) ? allocation.value : 0);
  }, 0);
  const indexWeight = stockTotal > 0 ? etfValue / stockTotal : 0;
  const innovationWeight = stockTotal > 0 ? innovationValue / stockTotal : 0;
  const classifiedSectorValue = d.allocation.reduce(
    (sum, allocation) =>
      sum +
      (securityMeta[allocation.symbol]?.sector ? allocation.value : 0),
    0,
  );
  const sectorCoverage =
    stockTotal > 0 ? classifiedSectorValue / stockTotal : 0;
  const durationConfidence = clamp01(days / 365);
  const activityConfidence = clamp01(tradeCount / 8);
  const baseConfidence = (durationConfidence + activityConfidence) / 2;
  const longTermScore = clamp01(
    (1 - activity) * 0.55 + clamp01(avgHoldingDays / 365) * 0.45,
  );
  const concentrationScore = clamp01(
    topWeight * 0.7 + clamp01(1 - (holdingsCount - 1) / 9) * 0.3,
  );

  const dimensions: StyleDimension[] = [
    { key: "longTerm", label: "운용 호흡", score: longTermScore, display: periodLabel, evidence: `평균 보유 ${periodLabel} · 연환산 매매 ${tradesPerYear.toFixed(1)}회`, lowLabel: "기민", highLabel: "장기", confidence: baseConfidence },
    { key: "concentration", label: "자본 배치", score: concentrationScore, display: pct(topWeight), evidence: `최대 사업부 ${pct(topWeight)} · 총 ${holdingsCount}개`, lowLabel: "분산", highLabel: "집중", confidence: 1 },
    { key: "income", label: "이익 활용", score: dividendScore, display: pct(annualizedDividendRatio), evidence: `관측 배당을 연환산하면 원금의 ${pct(annualizedDividendRatio)}`, lowLabel: "재투자", highLabel: "인컴", confidence: durationConfidence },
    { key: "defensive", label: "현금 운용", score: cashWeight, display: pct(cashWeight), evidence: `현재 현금 비중 ${pct(cashWeight)}`, lowLabel: "공격", highLabel: "방어", confidence: 1 },
    { key: "global", label: "지역 범위", score: clamp01(overseasWeight), display: pct(overseasWeight), evidence: `해외 사업부 비중 ${pct(overseasWeight)}`, lowLabel: "국내", highLabel: "글로벌", confidence: 1 },
    { key: "index", label: "종목 선택", score: clamp01(indexWeight), display: pct(indexWeight), evidence: `ETF 비중 ${pct(indexWeight)}`, lowLabel: "직접선택", highLabel: "인덱스", confidence: 1 },
    { key: "innovation", label: "산업 성향", score: clamp01(innovationWeight), display: sectorCoverage >= 0.5 ? pct(innovationWeight) : "분석 대기", evidence: sectorCoverage >= 0.5 ? `기술·바이오 섹터 비중 ${pct(innovationWeight)}` : `섹터 분류 커버리지 ${pct(sectorCoverage)} · 50%부터 분석`, lowLabel: "전통산업", highLabel: "혁신산업", available: sectorCoverage >= 0.5, confidence: sectorCoverage },
  ];

  const archetypes: Record<string, Omit<StyleArchetype, "key" | "score">> = {
    longTerm: { label: "장기보유가", emoji: "🌳", tagline: "시간을 내 편으로 만드는 운용 성향이 강해요." },
    concentration: { label: "확신형 집중투자가", emoji: "🎯", tagline: "소수 사업부에 자본을 집중하는 편이에요." },
    income: { label: "배당 수집가", emoji: "💵", tagline: "사업부가 보내는 현금흐름을 중시해요." },
    defensive: { label: "철벽 수비수", emoji: "🛡️", tagline: "현금을 보유하며 기회와 충격에 대비해요." },
    global: { label: "글로벌 분산가", emoji: "🌍", tagline: "국경을 넘어 사업부를 나눠 보유해요." },
    index: { label: "보글형 인덱서", emoji: "📊", tagline: "ETF로 시장 전체를 효율적으로 보유해요." },
    innovation: { label: "혁신 개척자", emoji: "🚀", tagline: "기술과 바이오 사업의 미래에 무게를 둬요." },
  };
  const rankedStyles = [...dimensions]
    .filter((dimension) => dimension.available !== false)
    .sort((a, b) => b.score - a.score)
    .map((dimension) => ({ key: dimension.key, score: dimension.score, ...archetypes[dimension.key] }));
  const primaryStyle = rankedStyles[0];
  const secondaryStyles = rankedStyles.slice(1, 3);
  const compositeDefinitions: Record<
    string,
    { label: string; emoji: string; tagline: string }
  > = {
    "concentration+longTerm": { label: "확신형 장기보유가", emoji: "🌳", tagline: "소수 사업부를 오래 보유하며 확신을 이어가요." },
    "income+longTerm": { label: "복리형 배당 수집가", emoji: "💵", tagline: "배당과 시간을 함께 쌓아 복리를 만들어요." },
    "index+longTerm": { label: "장기 인덱서", emoji: "📊", tagline: "시장 전체를 오래 보유하는 길을 택했어요." },
    "concentration+innovation": { label: "벤처 캐피탈리스트", emoji: "🚀", tagline: "소수 혁신 사업부의 미래에 자본을 집중해요." },
    "global+index": { label: "글로벌 인덱서", emoji: "🌍", tagline: "ETF로 세계 시장을 넓게 보유해요." },
    "defensive+income": { label: "철벽 인컴투자가", emoji: "🛡️", tagline: "방어력을 지키며 꾸준한 현금흐름을 모아요." },
    "global+innovation": { label: "글로벌 개척자", emoji: "🚀", tagline: "국경을 넘어 혁신 사업을 찾아 나서요." },
    "concentration+income": { label: "소수정예 배당투자가", emoji: "💵", tagline: "선별한 사업부의 현금흐름에 집중해요." },
    "defensive+index": { label: "보수적 인덱서", emoji: "🛡️", tagline: "시장에 참여하면서 현금 완충력도 지켜요." },
    "global+longTerm": { label: "글로벌 장기투자가", emoji: "🌍", tagline: "세계의 사업부를 긴 호흡으로 보유해요." },
  };
  const compositeCandidates = rankedStyles
    .slice(1)
    .filter(
      (style) =>
        primaryStyle.score >= 0.6 &&
        style.score >= 0.6 &&
        Math.abs(primaryStyle.score - style.score) <= 0.15,
    )
    .map((style) => {
      const key = [primaryStyle.key, style.key].sort().join("+");
      const definition = compositeDefinitions[key];
      return definition
        ? {
            key,
            score: (primaryStyle.score + style.score) / 2,
            ...definition,
          }
        : null;
    })
    .filter((style): style is StyleArchetype => style !== null)
    .sort((a, b) => b.score - a.score);
  const compositeStyle = compositeCandidates[0] ?? null;
  const displayStyle = compositeStyle ?? primaryStyle;
  const emoji = displayStyle.emoji;
  const label = displayStyle.label;
  const tagline = displayStyle.tagline;
  let warning: string | undefined;
  const insight =
    primaryStyle.key === "longTerm" && activity >= 0.6
      ? "장기보유 성향과 달리 최근 매매 빈도는 높은 편이에요. 의도한 변화인지 돌아보세요."
      : primaryStyle.key === "innovation" && concentrationScore >= 0.7
        ? "혁신 사업부에 집중돼 있어 기대와 변동성이 함께 커질 수 있어요."
        : undefined;
  const confidenceScore =
    dimensions.reduce(
      (sum, dimension) => sum + (dimension.confidence ?? 1),
      0,
    ) / dimensions.length;
  const confidenceLabel =
    confidenceScore >= 0.75
      ? "높음"
      : confidenceScore >= 0.45
        ? "보통"
        : "낮음";
  const confidence = {
    score: confidenceScore,
    label: confidenceLabel as "낮음" | "보통" | "높음",
    summary: `분석기간 ${days}일 · 거래 ${tradeCount}건 · 섹터 분류 ${pct(sectorCoverage)}`,
  };

  // 경고 = 스타일(잦은 매매)이 아니라 보편 악(高비용)에만. 성장·액티브 투자자도 공정.
  if (d.drag != null && d.drag >= 0.01) {
    warning = `마찰비용(수수료·세금)이 원금의 ${(d.drag * 100).toFixed(1)}%예요. 거래 빈도·수수료·계좌(세제)를 점검하면 수익이 올라가요.`;
  }

  // ── 투자 규율 점수 — 스타일 중립. 가치·성장 누구나 동의하는 "보편 규율"만 ──
  //  · 저비용: 마찰(수수료·세금)/원금 — 2% 이상이면 0점. (과매매는 여기서 '비용'으로만 페널티)
  //  · 저레버리지: 부채/자산 — 40% 이상이면 0점(무차입=만점)
  //  · 계획 준수: 자본배분 계획 이행률(계획 있을 때만)
  // 회전율·보유기간·집중도는 점수에서 제외 → 위 dimensions(중립 프로파일)에만 둔다.
  const lowCost = d.drag == null ? 1 : clamp01(1 - d.drag / 0.02);
  const assetsKrw = p.result.currentValuation;
  const debtRatio =
    debtKrw > 0 && assetsKrw && assetsKrw > 0 ? debtKrw / assetsKrw : 0;
  const lowLeverage = clamp01(1 - debtRatio / 0.4);

  const subScores: StyleDimension[] = [
    {
      key: "lowCost",
      label: "저비용",
      score: lowCost,
      display: d.drag == null ? "—" : `마찰 ${(d.drag * 100).toFixed(2)}%`,
    },
    {
      key: "lowLeverage",
      label: "저레버리지",
      score: lowLeverage,
      display: debtRatio > 0 ? pct(debtRatio) : "무차입",
    },
  ];
  // 가중치: 저비용 0.5 · 저레버리지 0.5 (계획 있으면 0.4·0.4·0.2 로 재배분).
  const weights = planAdherence != null ? [0.4, 0.4] : [0.5, 0.5];
  if (planAdherence != null) {
    subScores.push({
      key: "plan",
      label: "계획 준수",
      score: clamp01(planAdherence),
      display: pct(planAdherence),
    });
    weights.push(0.2);
  }
  const score = Math.round(
    subScores.reduce((s, f, i) => s + weights[i] * f.score, 0) * 100,
  );
  const grade = gradeOf(score);

  return {
    insufficient: false,
    emoji,
    label,
    tagline,
    summary: `매매 ${tradeCount}회 · 종목 ${holdingsCount}개 · 평균 보유 ${periodLabel}`,
    dimensions,
    primaryStyle,
    secondaryStyles,
    compositeStyle,
    insight,
    confidence,
    warning,
    score,
    grade,
    subScores,
  };
}
