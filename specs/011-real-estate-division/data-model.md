# Phase 1 Data Model: 부동산 사업부

## 스키마 변경 (Supabase, RLS)

### A. `manual_assets` 컬럼 추가 (기존 테이블 확장)

기존: `id, holding_id, name, kind, current_value, acquired_price, acquired_at, note, created_at, updated_at, deleted_at` (RLS 4정책).

추가 컬럼(모두 nullable):
| 컬럼 | 타입 | 의미 |
|------|------|------|
| `acquisition_cost` | numeric | 취득 부대비용(세금·중개료 등 단일 합산, ₩) |
| `valuation_source` | text | 평가 출처(KB/실거래가/감정가 등) |
| `valued_at` | date | 평가 갱신일 |
| `sale_price` | numeric | 매도가(₩). null=보유 중 |
| `sale_at` | date | 매도일. **null이면 보유, 있으면 매도됨** |
| `sale_cost` | numeric | 매도 부대비용(양도세·중개료 단일 합산, ₩) |

### B. `manual_asset_income` 신규 테이블 (임대 원장)

| 컬럼 | 타입 | 의미 |
|------|------|------|
| `id` | uuid PK | |
| `holding_id` | uuid FK→holdings | RLS 스코프 |
| `manual_asset_id` | uuid FK→manual_assets | 어느 부동산의 수익 |
| `date` | date | 받은 날 |
| `amount` | numeric | 임대수익(₩) |
| `cost` | numeric | 임대 관련 비용(재산세·관리비 등 단일 합산, ₩) |
| `note` | text null | 메모 |
| `created_at` / `deleted_at` | timestamptz | 소프트 삭제 |

**RLS**: `manual_asset_income`도 `holdings.user_id = auth.uid()` 스코프(select/insert/update/delete own) — `manual_assets`와 동일 패턴. 마이그레이션 후 `database.types.ts` 재생성.

## 타입 (src/lib/finance/realAssets.ts)

```text
ManualAsset (확장) {
  id, name, kind, currentValue, acquiredPrice, acquiredAt, note  // 기존
  acquisitionCost: number | null   // 취득 부대비용
  valuationSource: string | null
  valuedAt: string | null
  salePrice: number | null
  saleAt: string | null            // null=보유, 있으면 매도됨
  saleCost: number | null
}

ManualAssetIncome {
  id, assetId: string, date: string, amount: number, cost: number
}
```

## 파생 계산 (순수 함수)

### 자산 단위
- `effectiveCost(a)` = `acquiredPrice + (acquisitionCost ?? 0)` — **실질취득가**(수익률 분모). acquiredPrice 없으면 null(수익률 스코프 밖).
- `isSold(a)` = `a.saleAt != null`.
- `unrealizedGain(a)` = 보유 중(`!isSold`)이고 effectiveCost 있으면 `currentValue − effectiveCost`, 아니면 0/null.
- `saleGain(a)` = 매도면 `salePrice − effectiveCost − (saleCost ?? 0)`, 아니면 0.
- `rentNet(a, incomes)` = `Σ(income.amount − income.cost)` (해당 자산).
- `realizedGain(a, incomes)` = `saleGain(a) + rentNet(a, incomes)`.

### 사업부 합산 — `computeRealEstateDivision(assets, incomes)`
```text
{
  cost: Σ effectiveCost (취득가 있는 자산: 보유+매도 모두)
  unrealized: Σ unrealizedGain (보유 중만)
  realized:   Σ realizedGain  (임대 + 매도차익, net)
  gain: unrealized + realized
  ret:  cost>0 ? gain / cost : null        // 종합 수익률
  realizedRet:   cost>0 ? realized / cost : null
  unrealizedRet: cost>0 ? unrealized / cost : null
  // (표시용) heldValue, soldCount, assets 분해 등
}
```

### 010 연결 — `computeBusinessReturns` 확장
- 부동산 division 입력을 `manualCost = division.cost`, `manualGain = division.gain`(실현+미실현)으로 공급.
- 총자산 누적수익률(히어로)·사업부 카드가 자동으로 임대·매도까지 반영.
- **주식 XIRR·events는 불변**(FR-003).

### 불변식
- `effectiveCost` 없으면 수익률 미산출, 가치는 순자산에 합산(FR-009).
- 매도 자산은 `unrealized`에서 빠지고 `realized`에 들어감(이중 계상 금지).
- 모든 금액 ₩ 저장, 비율은 통화 무관. 임대/매도는 events에 영향 없음.

## 검증 규칙(입력)
- `currentValue > 0`, `name` 필수(기존).
- **현재가 < 매입가** → 저장 전 확인(FR-006).
- 매도 시 `salePrice`·`saleAt` 필수, `saleCost` 선택(기본 0).
- 임대 입력 시 `amount`·`date` 필수, `cost` 선택(기본 0).
