# Quickstart: 부동산 사업부 실투자금 수익률·순자산·LTV 검증

## 단위 테스트 (1차 게이트)

`src/lib/finance/realAssets.test.ts`·`financing.test.ts`에 케이스 추가 후:

```bash
npx vitest run src/lib/finance/realAssets.test.ts src/lib/finance/financing.test.ts
```

확인할 케이스:
1. **레버리지 증폭**: 취득가 10억·부대비용 0·대출 7억·평가 11억·이자 0 → `cost=10억`, `gain=1억`, `ownCapital=3억`, `ownCapitalReturn≈+33.3%`(자산수익률 +10%보다 큼), `netEquity=4억`, `ltv≈0.636`.
2. **임대 0 거주용**: 임대수익 없음·대출 있음 → `ownCapitalReturn`이 평가차익−이자 기반으로 `null` 아님.
3. **대출 0**: `debt=0` → `ownCapital===cost`, `ownCapitalReturn===ret`, `ltv` 미표시 대상.
4. **실투자금 ≤ 0**: 대출 ≥ 취득원가 → `ownCapitalReturn===null`.
5. **financing.debt**: `mortgageLiabilities` 합이 `DivisionFinancingCost.debt`와 일치.

## 타입·린트 게이트

```bash
npx tsc --noEmit
npx eslint src/lib/finance/realAssets.ts src/lib/finance/financing.ts src/components/networth/ManualAssetsSection.tsx
```

## 수동 E2E (앱 구동)

1. 개발 서버 실행(`run` 스킬 또는 프로젝트 표준 기동).
2. 부동산 물건 1건 등록(취득가·평가액 입력) → 그 물건에 담보대출 연결(`대출` 버튼).
3. `/real-estate`에서 사업부 헤더 아래 strip 확인:
   - 자산수익률 · 실투자금 수익률 **나란히**, 실투자금 수익률이 더 큰지(레버리지).
   - 순자산 = 평가액 − 대출잔액, LTV = 대출/평가액과 손계산 일치.
4. 임대수익 0인 채로도 실투자금 수익률이 "—"가 아닌지 확인.
5. 대출을 삭제하면 strip이 사라지는지(미표시) 확인.
6. 대체·사업 사업부엔 strip이 없는지(회귀) 확인.
7. **회귀**: 홈 "실물 사업부" 카드는 기존과 동일(자산수익률만), 총자산 누적수익률·주식 수익률 표시 불변.

## 통화 토글

₩/$ 전환 시 순자산 금액만 환산되고 수익률·LTV(%)는 불변인지 확인.
