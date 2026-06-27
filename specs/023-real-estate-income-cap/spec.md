# Feature Specification: 부동산 수익률환원법 평가

**Feature Branch**: `023-real-estate-income-cap`  
**Created**: 2026-06-28  
**Status**: Shipped ✅  
**Merged**: 2026-06-28 (PR #29)

## 배경 (Why)

`011-real-estate-division`에서 부동산 평가액을 직접 입력으로만 받았다. 수익형 부동산(상가·임대주택)은 **수익률환원법(Income Capitalization)**으로 평가하는 것이 더 합리적:

```
평가액 = 연간 순임대수익 ÷ 환원율
```

- 예: 연 임대수익 3,600만원, 환원율 4.5% → 평가액 ≈ 8억원
- 환원율(cap rate): 투자자가 기대하는 수익률. 보통 3~6% (지역·용도별 상이).
- 연간 순임대수익: 이미 기록된 `manual_asset_income` 레코드(최근 12개월)에서 자동 집계.

---

## 구현 요약

### DB 마이그레이션

`supabase/migrations/20260628010000_manual_assets_cap_rate.sql`:
```sql
alter table manual_assets
  add column if not exists valuation_method text not null default 'direct'
    check (valuation_method in ('direct', 'cap_rate')),
  add column if not exists cap_rate numeric;
```

### 핵심 계산 로직 (`src/lib/finance/realAssets.ts`)

`ManualAsset` 인터페이스:
```typescript
valuationMethod: "direct" | "cap_rate";
capRate: number | null; // 환원율(소수). 예: 0.045 = 4.5%
```

`capRateValue(asset, income, today)` — 수익률환원법 평가액 계산:
```typescript
// 최근 12개월 순임대수익 합산 / 환원율
const annualNet = income
  .filter(r => r.assetId === asset.id && r.date >= twelveMonthsAgo)
  .reduce((s, r) => s + r.amount - r.cost, 0);
return annualNet / asset.capRate;
```

`applyCapRateValuation(assets, income, today)` — `cap_rate` 자산의 `currentValue`를 계산값으로 override:
- 임대수익이 없거나 환원율 미입력 시 → `direct` 값 유지(폴백)
- 반환: `ManualAsset[]`(동일 타입, currentValue만 교체됨)

### 데이터 흐름

1. `loadManualAssets()` → DB에서 로드 (valuationMethod, capRate 포함)
2. `loadManualAssetIncome()` → 임대수익 원장 로드
3. `applyCapRateValuation(assets, income, today)` → cap_rate 자산 평가액 override
4. 이후 `totalManualAssets()`, `computeDivisions()` 등 기존 로직 그대로 사용

`src/app/dashboard/page.tsx`에서 두 개의 병렬 서버 컴포넌트가 각각 호출:
```typescript
const manualAssets = applyCapRateValuation(manualAssetsRaw, manualIncome, today);
```

### UI (`src/components/networth/ManualAssetForm.tsx`)

자산 종류가 수익을 내는 사업부(`ASSET_DIVISION_PRODUCES_INCOME`)일 때만 평가방법 토글 표시:
- 부동산 / 토지 / 상가·수익형 / 비상장·지분 → 토글 노출
- 실물·수집 / 기타 → 직접 입력만

토글 선택:
- `직접 입력`: 현재 평가액 숫자 입력 (기존 방식)
- `수익률환원법`: 환원율(%) 입력 → 저장 시 `currentValue: 0`, `cap_rate: 입력값`

### 액션 (`src/app/networth/actions.ts`)

`addManualAsset` / `updateManualAsset`:
```typescript
valuation_method: isCapRate ? "cap_rate" : "direct",
cap_rate: isCapRate ? capRate : null,
current_value: isCapRate ? 0 : Number(currentValue) || 0,
```

---

## 주요 변경 파일

| 파일 | 변경 내용 |
|------|---------|
| `supabase/migrations/20260628010000_manual_assets_cap_rate.sql` | 신규 컬럼 migration |
| `src/lib/supabase/database.types.ts` | 타입 재생성 |
| `src/lib/finance/realAssets.ts` | `ManualAsset` 타입 확장, `capRateValue`, `applyCapRateValuation` |
| `src/lib/realAssets.ts` | `loadManualAssets()` 매퍼에 새 필드 추가 |
| `src/app/networth/actions.ts` | `addManualAsset`/`updateManualAsset` cap_rate 저장 |
| `src/components/networth/ManualAssetForm.tsx` | 평가방법 토글 + 환원율 입력 UI |
| `src/app/dashboard/page.tsx` | `applyCapRateValuation` 호출 추가 |

---

## 설계 결정

- **`currentValue: 0`으로 저장**: cap_rate 자산은 임대수익이 쌓일수록 평가액이 바뀜. DB에 계산값 캐시하면 sync 문제. 대신 런타임에 `applyCapRateValuation()`으로 항상 계산.
- **최근 12개월 집계**: 연간화(annualize)를 위해. 전체 누적이 아닌 trailing 12mo는 최신 수익성 반영.
- **임대수익 없으면 direct 폴백**: 수익률환원법을 선택했어도 임대수익이 0건이면 의미있는 평가액을 만들 수 없음. 직접 입력 값(혹은 0)을 유지해 빈 화면 방지.
- **환원율 범위**: UI에서 0.1~20% 입력 허용. 저장은 소수(`0.045` = 4.5%). 화면 표시는 `%` 단위.

---

## `ASSET_DIVISION_PRODUCES_INCOME` 상수

`src/lib/finance/realAssets.ts`에서 export:
```typescript
export const ASSET_DIVISION_PRODUCES_INCOME: Record<string, boolean> = {
  부동산: true,
  대체: true,  // 비상장 지분 등
  사업: true,
  기타: false,
};
```

`assetDivision(kind)` → 종류→사업부 매핑. 이 사업부가 income 생성 여부로 토글 노출 결정.

---

## 연관 스펙

- `011-real-estate-division` — 수기 자산 기본 구조 (임대수익 원장, 사업부 카드)
- `014-real-estate-roe` — 부동산 ROE 계산
