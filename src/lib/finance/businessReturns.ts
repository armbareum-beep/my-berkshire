/**
 * 사업부별 누적수익률 — 지주회사 관점의 "각 사업부가 투입원가 대비 얼마나 불었나".
 *
 *  · 주식 사업부: 시세 기반(검증). 투입 = 설립자본 + 증자(gross), 손익 = 누적손익.
 *  · 부동산 등 사업부: 수기 평가 기반(추정). 투입 = 취득가 합, 손익 = 현재가 − 취득가.
 *    취득가 없는 수기자산은 제외(원가 모르면 수익률 계산 불가).
 *  · 총자산 누적: 두 사업부 합산(주식 시세가 있을 때만 — 없으면 불완전이라 생략).
 *
 * 연복리(XIRR)는 주식 사업부에서만 — 여기선 "총/누적" 관점. 모든 금액 ₩.
 */

export interface DivisionReturn {
  key: string;
  label: string;
  /** 투입원가 ₩. */
  invested: number;
  /** 누적손익 ₩. */
  gain: number;
  /** 누적수익률(gain/invested). invested<=0 이면 null. */
  ret: number | null;
  /** 추정 평가(부동산 등 수기) 여부 — 표시에 '추정' 표기. */
  estimated: boolean;
}

export interface BusinessReturnsResult {
  divisions: DivisionReturn[];
  /** 총자산 누적(주식 시세가 있을 때만). */
  total: DivisionReturn | null;
}

/** 수기 사업부 입력(부동산/대체/사업 각각). 취득가 합·손익 합. */
export interface ManualDivisionInput {
  key: string;
  label: string;
  cost: number;
  gain: number;
}

export function computeBusinessReturns(params: {
  /** 주식 투입원가(설립자본 + 증자, gross) ₩. */
  stockInvested: number;
  /** 주식 누적손익 ₩. 시세 실패 시 null. */
  stockGain: number | null;
  /** 수기 사업부들(부동산·대체·사업) — 취득가 있는 자산만 집계됨. */
  manualDivisions: ManualDivisionInput[];
}): BusinessReturnsResult {
  const { stockInvested, stockGain, manualDivisions } = params;
  const divisions: DivisionReturn[] = [];

  const stockOk = stockGain !== null && stockInvested > 0;
  if (stockOk) {
    divisions.push({
      key: "stock",
      label: "주식 사업부",
      invested: stockInvested,
      gain: stockGain as number,
      ret: (stockGain as number) / stockInvested,
      estimated: false,
    });
  }

  const manual = manualDivisions.filter((m) => m.cost > 0);
  for (const m of manual) {
    divisions.push({
      key: m.key,
      label: m.label,
      invested: m.cost,
      gain: m.gain,
      ret: m.gain / m.cost,
      estimated: true,
    });
  }

  // 합계는 주식(시세) 계산이 가능할 때만 — 안 그러면 불완전이라 호도.
  let total: DivisionReturn | null = null;
  if (stockOk) {
    const manualCost = manual.reduce((s, m) => s + m.cost, 0);
    const manualGain = manual.reduce((s, m) => s + m.gain, 0);
    const invested = stockInvested + manualCost;
    const gain = (stockGain as number) + manualGain;
    total =
      invested > 0
        ? {
            key: "total",
            label: "총자산 누적",
            invested,
            gain,
            ret: gain / invested,
            estimated: manual.length > 0,
          }
        : null;
  }

  return { divisions, total };
}
