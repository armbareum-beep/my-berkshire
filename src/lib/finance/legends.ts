/**
 * 거장 포트폴리오 — 13F 보유종목 큐레이션(공개 공시 기준).
 *
 * 정직 원칙(PRD §12 13번 무결성):
 *  · 공개·검증된 13F 데이터만. 사용자 임의 입력 경로 없음.
 *  · 13F는 분기·45일 지연·미국 상장 롱 포지션만(현금·채권·해외·숏 미포함) → 화면에 명시.
 *  · 취득가는 13F에 없음 → 종목별 수익률은 표시하지 않는다(추정 금지).
 *  · 수치는 큐레이션 스냅샷 — 분기마다 수동 갱신(quarterLabel 로 시점 정직 표기).
 *
 * V3에 SEC EDGAR 자동 파이프(CUSIP→티커)로 교체(인터페이스 seam). 지금은 정적.
 */

export interface LegendHolding {
  ticker: string;
  name: string;
  /** 보유 비중(0~1). */
  weight: number;
  /** 전분기 비중(0~1). 신규=0. 매수/매도 파생용. */
  prevWeight: number;
}

export interface Legend {
  key: string;
  name: string; // 인물(예: 워런 버핏)
  firm: string; // 운용사(예: 버크셔 해서웨이)
  quarterLabel: string; // "2025 1Q 13F 기준"
  source: string; // 출처(예: SEC 13F-HR)
  /**
   * 거장의 공개 "장기 트랙레코드"(연환산). 참고용 — 내 수익률과 머리맞대 %p로 겨루지 않는다
   * (기간 불일치·단기 운빨 함정 회피). 정확한 공개 수치만, 없으면 미표시.
   */
  longReturn?: { annual: number; period: string };
  holdings: LegendHolding[];
}

export type ChangeKind = "신규" | "추가" | "축소" | "청산" | "유지";

/** 전분기 대비 변화. 매수 탭=신규·추가, 매도 탭=축소·청산. */
export function changeOf(h: LegendHolding): ChangeKind {
  if (h.prevWeight === 0 && h.weight > 0) return "신규";
  if (h.weight === 0 && h.prevWeight > 0) return "청산";
  const d = h.weight - h.prevWeight;
  if (d > 0.005) return "추가";
  if (d < -0.005) return "축소";
  return "유지";
}

/**
 * 큐레이션 거장 풀. 수치는 공개 13F 기반 근사 스냅샷(시점은 quarterLabel).
 * 정확·최신화는 분기 수동 갱신 책임 — 시점 라벨로 정직 표기.
 */
export const LEGENDS: Legend[] = [
  {
    key: "buffett",
    name: "워런 버핏",
    firm: "버크셔 해서웨이",
    quarterLabel: "2025 1Q 13F 기준",
    source: "SEC 13F-HR",
    longReturn: { annual: 0.198, period: "1965–2023 연평균(버크셔 주당가치)" },
    holdings: [
      { ticker: "AAPL", name: "애플", weight: 0.26, prevWeight: 0.28 },
      { ticker: "AXP", name: "아메리칸 익스프레스", weight: 0.17, prevWeight: 0.15 },
      { ticker: "BAC", name: "뱅크오브아메리카", weight: 0.11, prevWeight: 0.13 },
      { ticker: "KO", name: "코카콜라", weight: 0.1, prevWeight: 0.09 },
      { ticker: "CVX", name: "셰브론", weight: 0.07, prevWeight: 0.06 },
      { ticker: "OXY", name: "옥시덴탈", weight: 0.05, prevWeight: 0.05 },
      { ticker: "MCO", name: "무디스", weight: 0.04, prevWeight: 0.04 },
      { ticker: "CB", name: "츄브", weight: 0.03, prevWeight: 0.028 },
      { ticker: "DVA", name: "다비타", weight: 0.02, prevWeight: 0.02 },
      { ticker: "KR", name: "크로거", weight: 0.015, prevWeight: 0.015 },
      { ticker: "VRSN", name: "베리사인", weight: 0.013, prevWeight: 0.012 },
      { ticker: "STZ", name: "컨스털레이션 브랜즈", weight: 0.013, prevWeight: 0.0 },
      { ticker: "C", name: "시티그룹", weight: 0.012, prevWeight: 0.014 },
      { ticker: "COF", name: "캐피털 원", weight: 0.011, prevWeight: 0.01 },
      { ticker: "AON", name: "에이온", weight: 0.009, prevWeight: 0.009 },
      { ticker: "V", name: "비자", weight: 0.009, prevWeight: 0.009 },
      { ticker: "MA", name: "마스터카드", weight: 0.008, prevWeight: 0.008 },
      { ticker: "AMZN", name: "아마존", weight: 0.008, prevWeight: 0.008 },
      { ticker: "DPZ", name: "도미노피자", weight: 0.006, prevWeight: 0.004 },
      { ticker: "NU", name: "누 홀딩스", weight: 0.005, prevWeight: 0.006 },
      { ticker: "POOL", name: "풀 코퍼레이션", weight: 0.004, prevWeight: 0.004 },
      { ticker: "LPX", name: "루이지애나-퍼시픽", weight: 0.003, prevWeight: 0.003 },
      { ticker: "KHC", name: "크래프트 하인즈", weight: 0.0, prevWeight: 0.03 },
    ],
  },
  {
    key: "wood",
    name: "캐시 우드",
    firm: "ARK Invest",
    quarterLabel: "2025 1Q 13F 기준",
    source: "SEC 13F-HR",
    holdings: [
      { ticker: "TSLA", name: "테슬라", weight: 0.12, prevWeight: 0.1 },
      { ticker: "COIN", name: "코인베이스", weight: 0.1, prevWeight: 0.09 },
      { ticker: "ROKU", name: "로쿠", weight: 0.07, prevWeight: 0.08 },
      { ticker: "HOOD", name: "로빈후드", weight: 0.06, prevWeight: 0.0 },
      { ticker: "PLTR", name: "팰런티어", weight: 0.05, prevWeight: 0.06 },
      { ticker: "RBLX", name: "로블록스", weight: 0.05, prevWeight: 0.05 },
      { ticker: "XYZ", name: "블록", weight: 0.045, prevWeight: 0.05 },
      { ticker: "CRSP", name: "크리스퍼 테라퓨틱스", weight: 0.04, prevWeight: 0.038 },
      { ticker: "SHOP", name: "쇼피파이", weight: 0.035, prevWeight: 0.03 },
      { ticker: "PATH", name: "유아이패스", weight: 0.03, prevWeight: 0.035 },
      { ticker: "TEM", name: "템퍼스 AI", weight: 0.03, prevWeight: 0.0 },
      { ticker: "ACHR", name: "아처 에비에이션", weight: 0.025, prevWeight: 0.02 },
      { ticker: "TOST", name: "토스트", weight: 0.025, prevWeight: 0.024 },
      { ticker: "DKNG", name: "드래프트킹스", weight: 0.02, prevWeight: 0.022 },
      { ticker: "RXRX", name: "리커전 파마", weight: 0.02, prevWeight: 0.018 },
      { ticker: "TWLO", name: "트윌리오", weight: 0.018, prevWeight: 0.02 },
      { ticker: "NTLA", name: "인텔리아 테라퓨틱스", weight: 0.015, prevWeight: 0.016 },
      { ticker: "BEAM", name: "빔 테라퓨틱스", weight: 0.012, prevWeight: 0.012 },
      { ticker: "TER", name: "테라다인", weight: 0.012, prevWeight: 0.01 },
      { ticker: "IRDM", name: "이리듐", weight: 0.01, prevWeight: 0.012 },
    ],
  },
  {
    key: "ackman",
    name: "빌 애크먼",
    firm: "퍼싱 스퀘어",
    quarterLabel: "2025 1Q 13F 기준",
    source: "SEC 13F-HR",
    holdings: [
      { ticker: "GOOG", name: "알파벳", weight: 0.19, prevWeight: 0.18 },
      { ticker: "CMG", name: "치폴레", weight: 0.17, prevWeight: 0.2 },
      { ticker: "QSR", name: "레스토랑 브랜즈", weight: 0.15, prevWeight: 0.14 },
      { ticker: "HLT", name: "힐튼", weight: 0.14, prevWeight: 0.13 },
      { ticker: "BN", name: "브룩필드", weight: 0.12, prevWeight: 0.0 },
      { ticker: "HHH", name: "하워드 휴즈", weight: 0.1, prevWeight: 0.11 },
      { ticker: "UBER", name: "우버", weight: 0.07, prevWeight: 0.0 },
      { ticker: "NKE", name: "나이키", weight: 0.04, prevWeight: 0.05 },
      { ticker: "CP", name: "캐나디안 퍼시픽 캔자스시티", weight: 0.02, prevWeight: 0.04 },
    ],
  },
];
