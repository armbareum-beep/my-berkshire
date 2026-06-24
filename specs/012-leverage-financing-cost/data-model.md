# Phase 1 Data Model: 레버리지 금융비용 수익률 반영

기능통화 ₩. 표시 환산은 화면. 모든 서버 접근 RLS·ownership 스코프.

## 1. 기존 재사용 엔티티

### Liability (기존 `liabilities` 테이블 / `src/lib/finance/liabilities.ts`)
- `id`, `name`, `kind`(CREDIT|MORTGAGE|MARGIN|OTHER), `principal`(잔액 ₩), `interestRate`(연이율 소수), `startedAt`(차입일|null)
- **변경 없음.** 본 기능이 이 필드들을 읽어 파생 이자를 계산.
- 짝짓기: `MORTGAGE` → 부동산 사업부. `MARGIN` → 주식(P3 보류). `CREDIT|OTHER` → 미차감.

### ManualAsset / ManualAssetIncome (기존, 011)
- 변경 없음. 임대수입(`amount`)·운영비(`cost`)는 그대로. 이자는 여기 넣지 않는다(division-level).

## 2. 신규 엔티티

### FinancingReconciliation (신규 테이블 `financing_reconciliation`)

부동산 사업부의 추정 이자를 실제값에 스냅하는 division-level 체크포인트.

| 필드 | 타입 | 제약 | 의미 |
|---|---|---|---|
| `id` | uuid | PK | |
| `holding_id` | uuid | FK holdings, not null | 소유 스코프(RLS) |
| `division` | text | not null, default 'REAL_ESTATE' | 자산군. v1은 'REAL_ESTATE'만 |
| `date` | date | not null | 보정 기준일(이 시점까지 확정) |
| `kind` | text | not null, check in ('interest_actual','capital') | 보정 성격 |
| `amount` | numeric | not null, check (amount >= 0) | interest_actual=직전 체크포인트~date의 확정 이자(비용). capital=투입 자본 |
| `note` | text | nullable | 메모 |
| `created_at` | timestamptz | not null default now() | |
| `deleted_at` | timestamptz | nullable | 소프트 삭제 |

- 인덱스: `(holding_id, division, date)`.
- RLS: `holding_id in (select id from holdings where user_id = auth.uid())` — select/insert/update/delete 4정책(011 `manual_asset_income`과 동형).
- **상태 전이**: 추가 → (소프트 삭제). 수정은 amount/note만. `kind='interest_actual'` 행의 `date`가 추정 tail의 기점을 리셋한다.

#### 로더 형태 (`src/lib/financingReconciliation.ts`)
```ts
interface FinancingReconciliation {
  id: string;
  division: "REAL_ESTATE";          // v1
  date: string;                      // YYYY-MM-DD
  kind: "interest_actual" | "capital";
  amount: number;                    // ₩, >= 0
  note: string | null;
}
loadFinancingReconciliations(supabase, holdingId): Promise<FinancingReconciliation[]>
```

## 3. 계산 모델 (순수 함수, 저장 안 함)

### 3.1 대출 집계 (`src/lib/finance/liabilities.ts` 확장)
```ts
mortgageLiabilities(items): Liability[]      // kind === 'MORTGAGE'
weightedAvgRate(items): number | null        // Σ(잔액×이율)/Σ잔액, 잔액 0이면 null
// 기존 annualInterest(items) = Σ(잔액×이율) 재사용. 월 추정 = annualInterest/12.
```

### 3.2 파생 이자 (`src/lib/finance/financing.ts` 신규)
```ts
monthsBetween(from: string, to: string): number   // 완전월 + 잔여일/월일수, 음수 0 클램프

interface FinancingInput {
  liabilities: Liability[];          // 해당 division 짝짓는 대출(예: mortgageLiabilities)
  reconciliations: FinancingReconciliation[];
  accrualStartFallback: string;      // 부동산 취득일/기록 시작일(startedAt null 폴백)
  asOf: string;                      // today (KST)
}

interface DivisionFinancingCost {
  confirmedInterest: number;   // Σ interest_actual.amount
  estimatedInterest: number;   // 마지막 interest_actual.date(없으면 기점) ~ asOf 파생 누적
  totalInterest: number;       // confirmed + estimated  (분자에서 차감)
  capitalAdded: number;        // Σ capital.amount        (분모=cost에 가산)
  weightedAvgRate: number | null;  // 표시용
  monthlyEstimate: number;     // annualInterest/12, 표시용
}

divisionFinancingCost(input: FinancingInput): DivisionFinancingCost
```
- 기점 = `max(대출별 startedAt ?? accrualStartFallback, 마지막 interest_actual.date)`.
- estimatedInterest = Σ대출 `principal × rate × monthsBetween(기점, asOf)/12`.
- `estimated`(추정) 부분은 UI에서 배지 표기 대상.

### 3.3 사업부 집계 확장 (`src/lib/finance/realAssets.ts`)
```ts
// 기존 시그니처에 옵셔널 financing 추가(하위호환: 미주입 시 011과 동일)
computeRealEstateDivision(assets, incomes, financing?: { totalInterest: number; capitalAdded: number })
```
- `realized -= financing.totalInterest`  (임대·매도차익 net에서 이자 차감)
- `cost += financing.capitalAdded`        (실질취득가에 자본 투입 가산)
- `gain = unrealized + realized` (이자 반영된 realized 사용)
- `ret = gain / cost` 등 기존 식 그대로 → 이자 차감 후 net 수익률(FR-008)

## 4. 불변식·검증 규칙

- **VI-1**: 짝짓는 대출이 없으면 `totalInterest=0, capitalAdded=0` → 011과 수치 동일(회귀).
- **VI-2**: `asOf < 기점`이면 estimatedInterest=0(미래 음수 금지).
- **VI-3**: 부동산 이자·보정은 `events`에 기록하지 않는다 → 주식 XIRR 불변(SC-005, 헌장 V).
- **VI-4**: `interest_actual` 보정 후 그 `date` 이후만 추정 → 확정 구간 이중계상 0.
- **VI-5**: 모든 금액 ₩, ≥0 제약. 공실 시 사업부 realized 음수 허용(이자만 차감).
