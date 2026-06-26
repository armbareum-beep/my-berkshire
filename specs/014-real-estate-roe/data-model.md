# Phase 1 Data Model: 부동산 사업부 실투자금 수익률·순자산·LTV

저장 데이터 변경 없음. 모든 신규 값은 **조회 시 파생**(in-memory). 아래는 계산 타입과 입력원.

## 입력 (기존, 변경 없음)

| 입력 | 출처 | 사용 |
|------|------|------|
| 취득가·부대비용·현재 평가액·매도여부 | `ManualAsset` ([realAssets.ts](../../src/lib/finance/realAssets.ts)) | 실투자금 분모, 평가액 |
| 대출 잔액·이율·물건연결 | `Liability` ([liabilities.ts](../../src/lib/finance/liabilities.ts)) | 대출잔액 합, 이자 |
| 자본투입·확정/추정 이자 | `FinancingReconciliation` / 파생 ([financing.ts](../../src/lib/finance/financing.ts)) | gain 분자(이자 차감), 실투자금 가산 |

## 변경 타입

### `DivisionFinancingCost` (financing.ts) — 필드 1개 추가

| 필드 | 타입 | 정의 |
|------|------|------|
| `debt` | `number` | 담보대출 잔액 합 = `totalLiabilities(liabilities)`. (기존 필드는 그대로) |

### `RealEstateDivision` (realAssets.ts) — 파생 지표 추가

| 필드 | 타입 | 정의 | 비고 |
|------|------|------|------|
| `debt` | `number` | `financing?.debt ?? 0` | 사업부 대출잔액 합 |
| `marketValue` | `number` | Σ 보유(미매도) 자산 `currentValue` | 취득가 없는 자산도 포함 |
| `ownCapital` | `number \| null` | `cost − debt` (실투자금). `≤0`이면 표시상 null 취급 | cost는 자본투입 포함 |
| `ownCapitalReturn` | `number \| null` | `ownCapital > 0 ? gain / ownCapital : null` | **실투자금 수익률** |
| `netEquity` | `number` | `netWorth(marketValue, debt)` | **순자산** (현재 평가 기준) |
| `ltv` | `number \| null` | `marketValue > 0 ? leverageRatio(marketValue, debt) : null` | **LTV** |

> `gain`(분자)은 기존 정의 그대로 = `unrealized + realized`이며 `realized`에서 `financing.totalInterest`가 이미 차감됨([realAssets.ts:223](../../src/lib/finance/realAssets.ts#L223)). 이자 이중계상 없음(FR-004).

## 불변식 / 검증 규칙

- **대출 0**: `debt = 0` → `ownCapital = cost`, `ownCapitalReturn = ret`, `ltv = 0`. UI는 `debt > 0`에서만 지표 묶음 노출 → 사실상 미표시(회귀 안전).
- **실투자금 ≤ 0** (대출 ≥ 취득원가): `ownCapitalReturn = null` → "—".
- **평가액 0** (보유 없음/전부 매도): `ltv = null`, `netEquity = −debt`(음수 가능).
- **비-부동산 사업부**: financing 미주입 → 위 "대출 0"과 동일 → 미표시.
- **레버리지 ↑ ⇒ |실투자금 수익률| ≥ |자산수익률|**: 동일 gain, 더 작은 분모 → 증폭. (테스트로 확인)

## 재사용 헬퍼 (신규 작성 금지)

- `totalLiabilities(items)` — 대출잔액 합 ([liabilities.ts:49](../../src/lib/finance/liabilities.ts#L49))
- `netWorth(assets, debt)` — 순자산 ([liabilities.ts:80](../../src/lib/finance/liabilities.ts#L80))
- `leverageRatio(assets, debt)` — LTV ([liabilities.ts:88](../../src/lib/finance/liabilities.ts#L88))
