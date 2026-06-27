# Feature Specification: 홈화면 보유종목 종목별 통합 표시

**Feature Branch**: `024-consolidated-holdings`  
**Created**: 2026-06-28  
**Status**: Shipped ✅  
**Merged**: 2026-06-28 (PR #30)

## 배경 (Why)

홈화면 보유 섹션이 **계좌별** 접이식이었다. 한 종목(예: 삼성전자)을 두 계좌에 나눠 보유하면 같은 종목이 두 번 보였다. 사용자가 원한 것은 **종목 단위 통합 뷰**: "삼성전자 총 50주, 총 평가액 X원".

계좌별 뷰는 자산 탭(`/accounts`)에서 이미 제공하므로 홈은 종목 통합으로 분리.

---

## 구현 요약

### 데이터 계층 (`src/lib/accounts.ts`)

`ConsolidatedHolding` 인터페이스:
```typescript
export interface ConsolidatedHolding {
  symbol: string;
  name: string;
  totalQuantity: number;    // 전 계좌 합산 수량
  totalValue: number;       // 전 계좌 합산 평가액
  totalGain: number | null; // 평단확인 보유의 합산 평가차익
  changeRate: number | null; // 가중평균 등락률 (원가 가중)
}
```

`flattenHoldings(groups: AccountGroup[]): ConsolidatedHolding[]`:
- 심볼 기준 `Map`으로 합산
- 등락률은 **원가 가중평균**: `Σ(현재가×수량) / Σ(평단×수량) - 1`
- 평단 없는 보유(gain === null)는 비율 왜곡 방지로 수량/금액만 합산, 비율 계산 제외
- 정렬: 평가액 내림차순

```typescript
// 가중평균 등락 계산 방식
e.costSum += h.value - h.gain; // costBasis = value - gain
e.curSum += h.value;
// → changeRate = curSum / costSum - 1
```

### UI 컴포넌트 (`src/components/dashboard/ConsolidatedHoldings.tsx`)

- 각 행: 로고 + 종목명/수량 + 평가액/등락
- 탭하면 `/stocks/${symbol}` 종목 상세로 이동
- 보유 없으면 "보유 종목 없음" 메시지

### 홈화면 교체 (`src/app/dashboard/page.tsx`)

```typescript
// 수정 전
import { AccountGroups } from "@/components/dashboard/AccountGroups";
<AccountGroups groups={accountGroups} ... />

// 수정 후
import { ConsolidatedHoldings } from "@/components/dashboard/ConsolidatedHoldings";
<CurrencyView
  krw={<ConsolidatedHoldings groups={accountGroupsKRW} currency="KRW" />}
  usd={<ConsolidatedHoldings groups={accountGroupsUSD} currency="USD" />}
/>
```

`AccountGroups` 컴포넌트는 삭제하지 않음 — `/accounts` 탭에서 계속 사용.

---

## 주요 변경 파일

| 파일 | 변경 내용 |
|------|---------|
| `src/lib/accounts.ts` | `ConsolidatedHolding` 인터페이스, `flattenHoldings()` 함수 추가 |
| `src/components/dashboard/ConsolidatedHoldings.tsx` | 신규 컴포넌트 |
| `src/app/dashboard/page.tsx` | `AccountGroups` → `ConsolidatedHoldings` 교체 |

---

## 설계 결정

- **`AccountGroups` 유지**: 계좌별 뷰는 `/accounts` 탭에서 필요. 홈에서만 `ConsolidatedHoldings`로 교체.
- **통화별 별도 인스턴스**: `groupsKRW`(factor=1), `groupsUSD`(factor=1/환율) 두 버전을 서버에서 미리 계산 → 클라이언트 ₩/$ 토글이 JS 없이 즉시 전환.
- **평단 없는 보유 처리**: 증여·이체 등으로 평단이 0인 종목을 비율 계산에 넣으면 등락률이 왜곡됨. `gain === null`이면 수량/금액만 합산.
- **정렬 기준**: 평가액 내림차순. 가장 많이 담긴 종목이 위로 → 한눈에 비중 파악.

---

## 데이터 흐름

```
loadAccountGroups(supabase, { holdingId, prices, factor })
  → AccountGroup[]
  → flattenHoldings(groups)
  → ConsolidatedHolding[]
  → <ConsolidatedHoldings groups={groups} currency="KRW" />
```

`loadAccountGroups`는 기존 코드 그대로. `flattenHoldings`는 순수 함수(메모리 변환만, DB 조회 없음).

---

## 연관 스펙

- `015-account-members` — 컴퍼니 레이어 (filterIncludedAccountGroups로 토글 제외 계좌 필터)
- `016-account-card-ui` — AccountGroups 계좌별 뷰 (홈 이외 사용처)
