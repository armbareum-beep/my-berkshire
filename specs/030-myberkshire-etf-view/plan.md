# Implementation Plan: 마이버크셔 ETF 투자자 뷰

**Branch**: `030-myberkshire-etf-view` | **Date**: 2026-06-28 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `/specs/030-myberkshire-etf-view/spec.md`

## Summary

ETF만 보유한 투자자가 마이버크셔 탭에 들어오면 텅 빈 화면을 보는 문제를 해결한다. 기업 스냅샷 카드와 ETF 현황 카드를 항상 페이지에 배치하되, 해당 자산을 보유하지 않으면 잠금(중립 티저) 상태로 표시한다. DB 변경 없음 — 기존 `secMeta`·`etf_ter_cache`·`computeDashboard` 결과를 재조합.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router — 이 repo 변형)  
**Primary Dependencies**: Next.js(Suspense 스트리밍), Supabase, Tailwind  
**Storage**: 기존 `etf_ter_cache` 재사용. 스키마 변경 없음  
**Testing**: `npx tsc --noEmit`, `npx eslint`  
**Target Platform**: 모바일 웹(단일 모드)  
**Project Type**: Web application (Next.js App Router)  
**Performance Goals**: ETF 현황 카드는 탭 진입 후 3초 이내 (TER은 Supabase 쿼리라 빠름)  
**Constraints**: 외부 API(Yahoo) 추가 호출 없음 (MVP), DB 변경 없음  
**Scale/Scope**: growth page 1개 + 신규 컴포넌트 2개

## Constitution Check

| 원칙 | 판정 | 근거 |
|------|------|------|
| I. 스타일 중립 | ✅ | ETF 현황 카드는 비용·비중 표시. 스타일 우열 없음 |
| II. 정직한 게이미피케이션 | ✅ | 잠금 카드는 사실("ETF를 보유하면 열립니다"). 가짜 숫자·죄책감 없음 |
| III. 엔진 정확·화면 단순 | ✅ | 기존 엔진(`etf_ter_cache`, `secMeta`) 재사용. 신규 계산 없음 |
| IV. 토스급 디자인 절제 | ✅ | 잠금 카드 = 회색 배경 + 최소 텍스트. 아이콘·애니메이션 없음 |
| V. 단일 진실원천 | ✅ | 보유 여부는 `events` 기반 portfolio에서 파생 |

## Project Structure

### Documentation (this feature)

```text
specs/030-myberkshire-etf-view/
├── plan.md         ← 이 파일
├── research.md     ← Phase 0 완료
├── data-model.md   ← Phase 1 완료
├── quickstart.md   ← Phase 1 완료
└── tasks.md        ← /speckit-tasks 에서 생성
```

### Source Code

```text
src/
├── app/growth/
│   └── page.tsx               ← 수정: ETF/개별주 분류 + 카드 배치 변경
└── components/growth/
    ├── CompanyTierCard.tsx    ← 수정 없음
    ├── EtfSnapshotCard.tsx    ← 신규: ETF 현황 카드 (활성 상태)
    └── LockedCard.tsx         ← 신규: 잠금 티저 카드 (재사용 가능)
```

## Implementation Steps

### Step 1: `LockedCard` 컴포넌트 생성
**파일**: `src/components/growth/LockedCard.tsx`

Props: `{ title: string; description: string }` (예: "🏭 내 지분 실적", "개별주를 보유하면 열립니다")  
스타일: `rounded-2xl bg-secondary p-5` — 기존 카드와 동일 레이아웃, 배경만 회색으로 구분  
텍스트: 제목(sm font-semibold text-muted-foreground) + 설명(xs text-muted-foreground)

### Step 2: `EtfSnapshotCard` 컴포넌트 생성
**파일**: `src/components/growth/EtfSnapshotCard.tsx`

Props:
```ts
{
  slices: Array<{ symbol: string; name: string; weight: number; ter: number | null }>;
  weightedAvgTer: number | null;
}
```

표시 내용:
- 제목: "📦 내 ETF 포트폴리오"
- 각 ETF: 종목명 + 비중 % (상위 5개, 나머지 접힘)
- 가중평균 TER: `{pct(weightedAvgTer, 2)}` / 없으면 항목 자체 숨김
- 토스 스타일: `rounded-2xl bg-card p-5 shadow-card`

### Step 3: `growth/page.tsx` 수정
**파일**: `src/app/growth/page.tsx`

**추가할 로직** (기존 `loadLiabilities·secMeta·dismissed` Promise.all 이후):
```ts
// ETF vs 개별주 분류
const etfAllocations = data.allocation.filter(
  a => secMeta[a.symbol]?.assetType === "ETF"
);
const hasEtf = etfAllocations.length > 0;
const hasStock = data.allocation.some(
  a => secMeta[a.symbol]?.assetType !== "ETF"
);

// TER 조회 (ETF 보유 시만)
const terMap = hasEtf
  ? await fetchKrxEtfTers(etfAllocations.map(a => a.symbol), supabase)
  : new Map<string, number>();
```

**ETF 통계 계산**:
```ts
const etfSlices = etfAllocations.map(a => ({
  symbol: a.symbol,
  name: secMeta[a.symbol]?.name ?? a.name,
  weight: a.weight,
  ter: terMap.get(a.symbol) ?? null,
}));

let weightedAvgTer: number | null = null;
let terWeightSum = 0, terSum = 0;
for (const s of etfSlices) {
  if (s.ter !== null) { terWeightSum += s.weight; terSum += s.weight * s.ter; }
}
if (terWeightSum > 0) weightedAvgTer = terSum / terWeightSum;
```

**JSX 수정** (기존 BusinessSnapshotStreamed 아래에 EtfSnapshotCard 추가):
```tsx
{/* 기업 스냅샷: 개별주 있으면 활성, 없으면 잠금 */}
{hasStock ? (
  <Suspense fallback={<GrowthCardSkeleton />}>
    <BusinessSnapshotStreamed ... />
  </Suspense>
) : (
  <LockedCard title="🏭 내 지분 실적" description="개별주를 보유하면 열립니다" />
)}

{/* ETF 현황: ETF 있으면 활성, 없으면 잠금 */}
{hasEtf ? (
  <EtfSnapshotCard slices={etfSlices} weightedAvgTer={weightedAvgTer} />
) : (
  <LockedCard title="📦 ETF 포트폴리오" description="ETF를 보유하면 열립니다" />
)}
```

## Complexity Tracking

없음 — 기존 패턴 안에서 컴포넌트 2개 추가 + page 수정.
