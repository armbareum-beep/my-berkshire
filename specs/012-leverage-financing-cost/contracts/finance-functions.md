# Contracts: 금융비용 함수·서버액션

이 앱은 외부 API를 노출하지 않는다. "계약"은 ① 순수 계산 함수 시그니처/불변식, ② 서버액션, ③ UI 표시 계약이다. 모두 단위테스트 가능.

## A. 순수 계산 함수

### `weightedAvgRate(items: Liability[]): number | null`
- 입력: 대출 배열(보통 `mortgageLiabilities` 결과).
- 출력: `Σ(잔액×이율)/Σ잔액`. 총잔액 0이면 `null`.
- 불변식: 단일 대출이면 그 대출 이율과 동일. 이율 0 대출은 가중에서 사실상 제외.

### `mortgageLiabilities(items: Liability[]): Liability[]`
- `kind === 'MORTGAGE'`만 필터. (MARGIN은 P3 보류, CREDIT/OTHER는 미차감.)

### `monthsBetween(from: string, to: string): number`
- YYYY-MM-DD 두 날짜의 경과 개월(완전월 + 잔여일/해당월 일수). `to <= from`이면 0.
- 결정적(UTC 달력). 미래/역전 입력은 0 클램프.

### `divisionFinancingCost(input: FinancingInput): DivisionFinancingCost`
- 계약:
  - `confirmedInterest = Σ reconciliations[kind=interest_actual].amount`
  - 기점 `start = max(최신 interest_actual.date 또는 (대출별 startedAt ?? accrualStartFallback))`
  - `estimatedInterest = Σ_liab principal×rate×monthsBetween(start, asOf)/12`
  - `totalInterest = confirmedInterest + estimatedInterest`
  - `capitalAdded = Σ reconciliations[kind=capital].amount`
  - `weightedAvgRate`, `monthlyEstimate(=annualInterest/12)` 동봉
- 불변식: 대출 0개 → 전부 0. `asOf < start` → estimated 0. 부수효과 없음(순수).

### `computeRealEstateDivision(assets, incomes, financing?)`
- `financing` 미주입 시 기존(011)과 **비트 동일** 결과(회귀 계약).
- 주입 시: `realized -= financing.totalInterest`, `cost += financing.capitalAdded`, 이후 `gain`·`ret` 재계산.
- 출력 타입(`RealEstateDivision`)은 기존 유지(필드 추가 시 옵셔널).

## B. 서버액션 (`src/app/real-estate/actions.ts`)

### `addFinancingReconciliation(input)`
- 입력: `{ division: 'REAL_ESTATE', date, kind: 'interest_actual'|'capital', amount, note? }`
- 검증: ownership(holding)·`amount >= 0`·`date <= today`·`kind` 화이트리스트.
- 효과: `financing_reconciliation` insert. 성공 시 사업부 화면 revalidate.
- 기본값: 폼 미선택 시 `kind='interest_actual'`(비용).

### `deleteFinancingReconciliation(id)`
- ownership 검증 후 소프트 삭제(`deleted_at=now()`). revalidate.

## C. UI 표시 계약 (`RealEstateDivisionCard` / `FinancingReconcileForm`)

- 사업부 순수익은 **이자 차감 후 net**으로 표기(FR-008). 이자 라인은 "추정" 배지(앰버/회색 보조 톤, 헌장 IV).
- 가중평균율·월 추정 이자를 사업부 카드 보조 정보로 표시.
- 보정 폼: 금액 + kind 토글("내 돈 추가(자본)" / "추정 오차(비용)"), 기본 선택=비용. 미래일 입력 차단.
- 짝짓는 대출이 없으면 이자 UI 미노출(011 화면과 동일, 점진적 공개).
- 모든 금액 ₩ 저장, 화면에서 ₩/$ 토글 환산.

## D. 검증 케이스(테스트 매핑)

| 케이스 | 함수 | 기대 |
|---|---|---|
| 대출 1억@3%, 1개월 경과 | divisionFinancingCost | estimated ≈ 250,000 |
| 대출 1억@3%+5천@4%, 월 | weightedAvgRate / monthly | avg≈3.33%, monthly≈41,667 |
| 대출 0개 | computeRealEstateDivision(financing 미주입) | 011과 동일 |
| interest_actual 보정 후 | divisionFinancingCost | 보정일 이전 confirmed, 이후만 estimated |
| capital 보정 | computeRealEstateDivision | cost↑, realized 불변 |
| asOf < 기점 | divisionFinancingCost | estimated=0 |
| 공실(임대 0, 이자만) | computeRealEstateDivision | realized 음수 |
