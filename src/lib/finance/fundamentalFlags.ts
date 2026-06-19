/**
 * 펀더멘털 플래그 — "재무제표가 던지는 질문"(PRD §8-2 / §11).
 *
 * ★ 핵심 원칙 — 단정하지 않는다. 진단·투자조언이 아니라 **신호 + 질문 + 확인처**.
 *   같은 신호도 회사마다 좋고 나쁨이 갈리므로(예: 재고 증가 = 수요 둔화일 수도, 증산 대비일 수도)
 *   "이 회사 위험" 같은 단정 금지. 항상 "무엇을 의심하고, 어디서 확인할지"만 안내.
 *
 * 1급(이익의 진짜 여부) — 현금흐름표가 있어 가능:
 *   F1 순이익↑인데 영업현금흐름↓ (이익의 질, 분식 1순위)
 *   F2 순이익 vs 영업이익 괴리 (일회성·영업외 이익)
 *   F3 매출채권이 매출보다 급증 (밀어내기 매출)
 *   F4 재고가 매출보다 급증 (떨이 임박)
 * 2급:
 *   F5 이자보상배율 < 1 (좀비기업)
 *
 * 전부 규칙 기반·토큰 0. 데이터는 펀더멘털(DART/EDGAR)에서 이미 추출됨 — 새 수집 없음.
 * 순수함수 — 화면은 호출만. 금융업(매출 개념 없음)은 일반 해석이 안 맞아 건너뜀.
 */

import { getFundamentalsSeries, type Fundamentals } from "./dart";
import { signedPct, pct } from "../format";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";

export type FlagTone = "warn" | "info";

export interface FundamentalFlag {
  id: string;
  tone: FlagTone;
  /** 짧은 신호 라벨(무슨 일이 보이는지). */
  title: string;
  /** 무엇을 의심·확인할지 — 질문/안내형(단정 아님). */
  question: string;
  /**
   * 발화시킨 실제 숫자 — 추상적 질문만 던지지 않고 근거를 같이 보여준다.
   * (예: "순이익 +19.5% · 영업현금흐름 −5.7%") 화면이 그대로 렌더.
   */
  evidence?: { label: string; value: string }[];
}

/** (cur − prev) / |prev|. prev 가 0/누락이면 null(증가율 정의 불가). */
function growth(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return (cur - prev) / Math.abs(prev);
}

/**
 * series 는 **최신순**(getFundamentalsSeries 반환 형태). 최신·직전 연도를 비교.
 * 데이터가 없는 규칙은 조용히 생략 — 억지로 플래그를 만들지 않는다.
 */
export function computeFundamentalFlags(
  series: Fundamentals[],
): FundamentalFlag[] {
  const cur = series[0];
  if (!cur) return [];
  // 금융업은 매출·재고·매출채권 개념이 일반 기업과 달라 해석이 어긋남 → 건너뜀.
  if (cur.isFinancial) return [];
  const prev = series[1] ?? null;
  const flags: FundamentalFlag[] = [];

  // ── F1. 순이익↑ · 영업현금흐름↓ (이익의 질) ──
  // 발화는 그대로 두되, 근거(현금전환율 등)를 같이 실어 회장이 직접 판단하게 한다.
  // (예: 애플 FY24 일회성 세금 기저효과 → 현금전환 100%면 이익의 질 문제 아님이 한눈에)
  if (prev) {
    const niG = growth(cur.netIncome, prev.netIncome);
    const ocfG = growth(cur.ocf, prev.ocf);
    if (niG != null && ocfG != null && niG > 0.05 && ocfG < -0.05) {
      flags.push({
        id: "earnings-quality",
        tone: "warn",
        title: "순이익은 늘었는데 영업현금흐름은 줄었어요",
        question:
          "이익이 실제 현금으로 들어왔는지(이익의 질) — 매출채권·일회성 손익을 확인해보세요.",
        evidence: [
          { label: "순이익", value: `${signedPct(niG)} (전년比)` },
          { label: "영업현금흐름", value: `${signedPct(ocfG)} (전년比)` },
          ...(cur.ocf != null && cur.netIncome != null && cur.netIncome !== 0
            ? [
                {
                  label: "현금전환",
                  value: `OCF÷순이익 ${pct(cur.ocf / cur.netIncome, 0)}`,
                },
              ]
            : []),
        ],
      });
    }
  }

  // ── F3. 매출채권이 매출보다 급증 (밀어내기 매출) ──
  if (prev) {
    const recG = growth(cur.receivables, prev.receivables);
    const revG = growth(cur.revenue, prev.revenue);
    if (recG != null && revG != null && recG > 0.1 && recG - revG > 0.15) {
      flags.push({
        id: "receivables-surge",
        tone: "warn",
        title: "매출채권이 매출보다 빨리 늘었어요",
        question:
          "팔았지만 아직 못 받은 돈이 급증 — 밀어내기 매출·회수 위험은 아닌지 주석을 확인해보세요.",
        evidence: [
          { label: "매출채권", value: `${signedPct(recG)} (전년比)` },
          { label: "매출", value: `${signedPct(revG)} (전년比)` },
        ],
      });
    }
  }

  // ── F4. 재고가 매출보다 급증 (떨이 임박) ──
  if (prev) {
    const invG = growth(cur.inventory, prev.inventory);
    const revG = growth(cur.revenue, prev.revenue);
    if (invG != null && revG != null && invG > 0.1 && invG - revG > 0.15) {
      flags.push({
        id: "inventory-surge",
        tone: "warn",
        title: "재고가 매출보다 빨리 쌓였어요",
        question:
          "안 팔린 재고가 급증 — 수요 둔화·향후 할인(마진 압박) 가능성은 없는지 확인해보세요.",
        evidence: [
          { label: "재고", value: `${signedPct(invG)} (전년比)` },
          { label: "매출", value: `${signedPct(revG)} (전년比)` },
        ],
      });
    }
  }

  // ── F2. 순이익 vs 영업이익 괴리 (일회성·영업외) ──
  // 영업이익이 (+)인데 순이익이 그보다 30%+ 큼 → 영업외/일회성 이익이 순이익을 키웠을 수 있음.
  if (
    cur.operatingIncome != null &&
    cur.operatingIncome > 0 &&
    cur.netIncome != null &&
    cur.netIncome > cur.operatingIncome * 1.3
  ) {
    flags.push({
      id: "net-above-operating",
      tone: "info",
      title: "순이익이 영업이익보다 큽니다",
      question:
        "영업 밖(자산 처분·평가이익 등 일회성)에서 이익이 보태졌을 수 있어요 — 지속 가능한 이익인지 확인.",
      evidence: [
        {
          label: "순이익÷영업이익",
          value: `${(cur.netIncome / cur.operatingIncome).toFixed(2)}배`,
        },
      ],
    });
  }

  // ── F5. 이자보상배율 < 1 (좀비기업) ──
  if (
    cur.operatingIncome != null &&
    cur.interestExpense != null &&
    cur.interestExpense > 0 &&
    cur.operatingIncome < cur.interestExpense
  ) {
    flags.push({
      id: "interest-coverage",
      tone: "warn",
      title: "영업이익으로 이자를 다 갚지 못해요 (이자보상배율 < 1)",
      question:
        "한 해 영업이익이 이자비용보다 적어요 — 부채 상환 능력·차입 구조를 확인해보세요.",
      evidence: [
        {
          label: "이자보상배율",
          value: `${(cur.operatingIncome / cur.interestExpense).toFixed(2)}배 (1배 미만)`,
        },
      ],
    });
  }

  return flags;
}

export interface PortfolioFlagGroup {
  symbol: string;
  name: string;
  flags: FundamentalFlag[];
}

/**
 * 지주회사(포트폴리오) 레벨 플래그 — 보유 사업부마다 펀더멘털 플래그를 모아
 * "내 자회사들 중 어디에 확인할 신호가 있나"를 한눈에(PRD §8-2 투시 상세 요약).
 *
 * 신호 판정엔 최신·직전 2개년이면 충분 → 종목당 2년만 조회(비용 최소, 캐시·메모이즈).
 * 신호가 없는(또는 펀더멘털을 못 받은) 사업부는 결과에서 제외. 순서는 입력 순서(기여순) 유지.
 */
export async function computePortfolioFlags(
  holdings: { symbol: string; name: string }[],
  year: number,
  supabase?: SupabaseClient<Database>,
): Promise<PortfolioFlagGroup[]> {
  const groups = await Promise.all(
    holdings.map(async ({ symbol, name }) => {
      const series = await getFundamentalsSeries(symbol, year, 2, supabase);
      return { symbol, name, flags: computeFundamentalFlags(series) };
    }),
  );
  return groups.filter((g) => g.flags.length > 0);
}
