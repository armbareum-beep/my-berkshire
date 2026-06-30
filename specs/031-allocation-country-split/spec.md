# 031 — Allocation 국가별 분리 + 드랍시트 전환

## 목표

allocation 페이지를 **유형별 / 국가별 / 산업별** 3탭으로 재설계하고, 카테고리 드릴다운을 URL 이동 대신 **바텀시트(드랍시트)** 로 전환. 홈 자산구성 카드도 국가 탭 클릭 시 드랍시트로 연동.

---

## 구현 범위

### 1. 국가 분류 개선 (`src/lib/securities.ts`)

- `countryOf()` 우선순위: `catalog.underlyingCountry` → DB 적재값 → `CCY_TO_COUNTRY` → `"기타"`
- 원자재·코인 → 지리적 국가 없음 → 항상 `"기타"`
- DB에 stale `"기타"` 저장된 경우 `countryOf()` 재추론으로 덮어씀 (`r.country !== "기타"` 조건)
- `CCY_TO_COUNTRY` 맵 추가: JPY→일본, EUR→유럽, HKD→홍콩, GBP→영국, CNY→중국 등

### 2. Allocation 3탭 UI (`src/app/allocation/[tag]/page.tsx`)

| 탭 | 경로 | 내용 |
|---|---|---|
| 유형별 | `/allocation/type` | 주식·ETF·원자재·코인 카테고리. 주식=국가 서브그룹, ETF=국가 배지 |
| 국가별 | `/allocation/country` | 국가별 카테고리. 각 국가 안에 주식/ETF 서브탭 |
| 산업별 | `/allocation/sector` | 섹터별 카테고리. 미분류 포함, 현금 슬라이스 추가 |

- `?only=한국` 직접 URL → 기존 전체 페이지 확장 뷰 유지 (딥링크 폴백)
- `/allocation` → `/allocation/type` 리다이렉트

### 3. 카테고리 정렬 핀닝

```ts
function pinnedOrder(label: string): number {
  if (label === "현금") return 3;           // 항상 최하단
  if (tag === "sector" && label === "미분류") return 2;
  if (tag === "country" && label === "기타") return 1;
  return 0; // 나머지는 value 내림차순
}
```

### 4. 산업별 현금 슬라이스 (`src/app/allocation/[tag]/page.tsx`)

```ts
// 기존: if (data.cash > 0 && cfg.key !== "sector")
// 변경: 산업별에도 현금 포함
if (data.cash > 0) { ... }
```

### 5. 드랍시트 — CategoryDrawer (`src/components/allocation/CategoryDrawer.tsx`)

- allocation 3탭 메인 뷰: 카테고리 카드 클릭 → URL 변경 없이 바텀시트 오픈
- 시트 내용: **도넛 차트(168px) + 범례** + 서브탭(국가별) + 종목 목록
- 국가별 시트: 주식/ETF 서브탭 전환 시 도넛 갱신
- 유형별-주식 시트: 국가 서브그룹
- 유형별-ETF 시트: 국가 배지
- 현금 시트: 잔액 + `/cash` 링크

### 6. 홈 자산구성 드랍시트 — AllocationCard (`src/components/dashboard/AllocationCard.tsx`)

- 국가 bar 클릭 → 바텀시트 (도넛 + 주식/ETF 서브탭 + 종목 목록)
- `itemsByCountry` 서버에서 계산해 props로 전달 (`dashboard/page.tsx`)
- "자산구성 ›" 헤더 → `/allocation/type` 페이지 이동 유지

### 7. BottomSheet 컴포넌트 (`src/components/ui/BottomSheet.tsx`)

기존 `Sheet.tsx` (인터셉터 라우트 기반)와 동일한 디자인 언어로 구현:

| 항목 | 값 |
|---|---|
| 애니메이션 | `animate-[sheet-in_220ms_ease-out_forwards]` |
| 최대 높이 | `max-h-[90dvh]` |
| 배경 | `bg-black/40` |
| 핸들 | `mx-auto h-1 w-10 rounded-full bg-border` |
| X 버튼 | 우상단 `rounded-full bg-secondary` |
| 스와이프 닫기 | 100px 임계값 |
| 스크롤락 | `document.body.style.overflow = "hidden"` |
| ESC 닫기 | ✓ |

---

## 파일 목록

| 파일 | 변경 유형 |
|---|---|
| `src/lib/securities.ts` | 수정 — `CCY_TO_COUNTRY`, 원자재·코인 국가 고정, stale 재추론 |
| `src/lib/allocation.ts` | 수정 — `groupByTag` 산업별 현금 포함 |
| `src/app/allocation/[tag]/page.tsx` | 수정 — 3탭 + 핀닝 정렬 + CategoryDrawer 연동 |
| `src/app/allocation/page.tsx` | 수정 — `/allocation/type` 리다이렉트 |
| `src/app/allocation/sleeve/[type]/page.tsx` | 수정 — 유형 탭 제거 |
| `src/app/dashboard/page.tsx` | 수정 — `itemsByCountry` 계산, AllocationCard 신규 import |
| `src/components/allocation/CategoryDrawer.tsx` | 신규 |
| `src/components/dashboard/AllocationCard.tsx` | 신규 (client component 분리) |
| `src/components/ui/BottomSheet.tsx` | 신규 |
| `src/components/dashboard/cards.tsx` | 수정 — AllocationCard 이전 후 정리 |

---

## 설계 결정

- **드랍시트 방식**: URL 기반 intercepting route 대신 client state. allocation 3탭 메인 뷰는 이미 server fetch가 완료된 데이터를 재사용하므로 추가 서버 요청 불필요.
- **`?only=` URL 유지**: 딥링크/공유 폴백용으로 전체 페이지 뷰 유지. 클라이언트 진입은 드랍시트.
- **도넛 크기**: 시트 내 도넛은 기본 168px (메인 페이지와 동일). 120px 시도 시 내부 텍스트 과밀.
