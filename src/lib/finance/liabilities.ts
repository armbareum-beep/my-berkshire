/**
 * 부채(대출) 계산 — 순자산 = 자산 − 부채, 레버리지 리스크.
 *
 * 버핏式 철학: 무차입이 최선. 레버리지는 수익도 손실도 증폭한다.
 * "똑똑한 사람이 망하는 유일한 방법은 레버리지다."
 *
 * 모든 금액은 ₩(기능통화). 표시 통화 환산은 화면에서 factor 로.
 */

export type LiabilityKind = "CREDIT" | "MORTGAGE" | "MARGIN" | "OTHER";

export const LIABILITY_KINDS: LiabilityKind[] = [
  "CREDIT",
  "MORTGAGE",
  "MARGIN",
  "OTHER",
];

export const LIABILITY_KIND_LABEL: Record<LiabilityKind, string> = {
  CREDIT: "신용대출",
  MORTGAGE: "담보대출",
  MARGIN: "증권 마진",
  OTHER: "기타",
};

/** 종류별 한 줄 설명(입력 시 도움말). */
export const LIABILITY_KIND_DESC: Record<LiabilityKind, string> = {
  CREDIT: "신용대출·마이너스통장 등 무담보 차입",
  MORTGAGE: "주택·부동산을 담보로 한 대출",
  MARGIN: "증권사 신용융자·미수 — 주식 담보, 반대매매 위험",
  OTHER: "전세보증금·지인 차입 등",
};

export interface Liability {
  id: string;
  name: string;
  kind: LiabilityKind;
  /** 현재 잔액(₩). */
  principal: number;
  /** 연이율(소수, 0.05 = 5%). */
  interestRate: number;
  /** 차입일(YYYY-MM-DD) 또는 null. */
  startedAt: string | null;
}

/** 총부채(₩) = Σ 잔액. */
export function totalLiabilities(items: Liability[]): number {
  return items.reduce((s, l) => s + l.principal, 0);
}

/** 연 이자 부담(₩) = Σ 잔액 × 연이율. */
export function annualInterest(items: Liability[]): number {
  return items.reduce((s, l) => s + l.principal * l.interestRate, 0);
}

/** 순자산 = 자산 − 부채. */
export function netWorth(assets: number, debt: number): number {
  return assets - debt;
}

/**
 * 부채비율 = 부채 / 자산 (0~). 자산 대비 빌린 돈의 비중.
 * 자산 0이면 부채 유무로 0 또는 Infinity.
 */
export function leverageRatio(assets: number, debt: number): number {
  if (debt <= 0) return 0;
  if (assets <= 0) return Infinity;
  return debt / assets;
}

/**
 * 레버리지 배수(equity multiplier) = 총자산 ÷ 순자산.
 * 내 자기자본이 자산 변동에 몇 배로 노출됐는지 = "수익률 뻥튀기" 계수.
 *   자산이 1% 움직이면 순자산은 약 (배수)% 움직인다(이익도 손실도).
 * 무차입이면 1.0배. 순자산 ≤ 0(부채 ≥ 자산)이면 null(채무초과).
 */
export function equityMultiplier(assets: number, debt: number): number | null {
  if (debt <= 0) return 1;
  const equity = assets - debt;
  if (equity <= 0) return null; // 채무초과 — 배수로 표현 불가
  return assets / equity;
}

export type LeverageLevel = "none" | "safe" | "caution" | "danger";

/**
 * 레버리지 위험 등급(버핏式 보수적 기준, 부채/자산):
 *  · none    : 무차입 (이상적)
 *  · safe    : < 20%
 *  · caution : 20% ~ 40%
 *  · danger  : > 40%  (또는 자산 ≤ 부채)
 */
export function leverageLevel(assets: number, debt: number): LeverageLevel {
  if (debt <= 0) return "none";
  const r = leverageRatio(assets, debt);
  if (r < 0.2) return "safe";
  if (r <= 0.4) return "caution";
  return "danger";
}

export interface LeverageVerdict {
  level: LeverageLevel;
  emoji: string;
  title: string;
  /** 버핏式 코칭 한 줄. */
  message: string;
}

/** 등급 → 표시(이모지·제목·코칭). 화면이 직접 판단하지 않게 여기서 결정. */
export function leverageVerdict(
  assets: number,
  debt: number,
): LeverageVerdict {
  const level = leverageLevel(assets, debt);
  switch (level) {
    case "none":
      return {
        level,
        emoji: "💎",
        title: "무차입 경영",
        message: "빚 없이 자기 자본으로만. 버핏이 가장 좋아하는 상태예요.",
      };
    case "safe":
      return {
        level,
        emoji: "🟢",
        title: "안전",
        message: "레버리지가 낮아요. 시장이 흔들려도 버틸 여력이 충분해요.",
      };
    case "caution":
      return {
        level,
        emoji: "🟡",
        title: "주의",
        message:
          "부채가 자산의 5분의 1을 넘었어요. 하락장에선 이자와 평가손이 동시에 압박해요.",
      };
    case "danger":
      return {
        level,
        emoji: "🔴",
        title: "위험",
        message:
          "레버리지가 높아요. 빚은 똑똑한 사람도 파산시킬 수 있어요(버핏). 상환을 우선 고려하세요.",
      };
  }
}
