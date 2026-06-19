/**
 * 리밸런싱 배분 엔진 — "새 돈을 목표비중에 맞춰 부족한 칸에 비례 배분(파는 것 없이)".
 * 종목 레벨·카테고리(국가/유형) 레벨이 같은 함수를 레벨만 바꿔 재사용한다.
 */

export interface RebalItem {
  key: string;
  label: string;
  value: number; // 현재 평가액
  targetFrac: number; // 목표비중 0~1
}

export interface RebalAlloc {
  key: string;
  label: string;
  amount: number; // 이번에 넣을 금액
}

/**
 * 부족분-비례 배분:
 *  · 목표금액 = (현재총액 + 투자금) × 목표비중, 부족분 = max(0, 목표 − 현재)
 *  · 투자금이 총부족분보다 작으면 → 부족분 비례로 나눔
 *  · 투자금이 총부족분보다 크면 → 부족분 먼저 채우고, 남는 건 목표비중 비례로
 * (기존 종목 리밸런싱 계산기와 동일 규칙. 현금도 하나의 칸으로 넣으면 "남길 현금"이 된다.)
 */
export function planInvestment(items: RebalItem[], invest: number): RebalAlloc[] {
  const total = items.reduce((s, i) => s + i.value, 0) + invest;
  const withDeficit = items.map((i) => ({
    ...i,
    deficit: Math.max(0, total * i.targetFrac - i.value),
  }));
  const totalDeficit = withDeficit.reduce((s, i) => s + i.deficit, 0);
  const sumT = items.reduce((s, i) => s + i.targetFrac, 0);

  return withDeficit.map((i) => {
    let amount = 0;
    if (invest > 0) {
      if (totalDeficit <= invest)
        amount =
          i.deficit + (invest - totalDeficit) * (sumT > 0 ? i.targetFrac / sumT : 0);
      else amount = totalDeficit > 0 ? (invest * i.deficit) / totalDeficit : 0;
    }
    return { key: i.key, label: i.label, amount };
  });
}
