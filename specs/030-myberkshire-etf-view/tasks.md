# Tasks: 마이버크셔 ETF 투자자 뷰

**Input**: Design documents from `/specs/030-myberkshire-etf-view/`  
**Branch**: `030-myberkshire-etf-view`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 병렬 실행 가능 (다른 파일, 선행 의존 없음)
- **[Story]**: 유저 스토리 레이블 (US1·US2·US3)

---

## Phase 1: Setup

신규 의존성·프로젝트 구조 변경 없음 — 생략.

---

## Phase 2: Foundational (공통 선행 작업)

**Purpose**: 모든 유저 스토리가 공유하는 `LockedCard` 컴포넌트 + growth page 분류 로직. US1·US2 모두 의존.

**⚠️ CRITICAL**: 이 Phase 완료 전에 US1·US2 구현 불가.

- [x] T001 `LockedCard` 컴포넌트 생성 — `src/components/growth/LockedCard.tsx`. Props: `{ title: string; description: string }`. 스타일: `rounded-2xl bg-secondary p-5`, 제목 `text-sm font-semibold text-muted-foreground`, 설명 `text-xs text-muted-foreground`. 아이콘·애니메이션 없음(헌법 IV).
- [x] T002 `src/app/growth/page.tsx`에 ETF/개별주 분류 로직 + TER 조회 추가. `secMeta`(기존 로드) 활용해 `etfAllocations`·`hasEtf`·`hasStock` 계산. `fetchKrxEtfTers` 호출로 `terMap` 조회(ETF 없으면 스킵). `etfSlices`·`weightedAvgTer` 계산. JSX 수정 없음 — 데이터 준비만.

**Checkpoint**: LockedCard 렌더 가능, page.tsx에 hasEtf·hasStock 변수 있음.

---

## Phase 3: User Story 1 — ETF 현황 카드 (Priority: P1) 🎯 MVP

**Goal**: ETF만 보유한 사용자가 마이버크셔에서 ETF 현황 카드(활성)와 기업 스냅샷 잠금 카드를 본다.

**Independent Test**: ETF만 보유한 계좌로 `/growth` 진입 → ETF 현황 카드(비중·TER 표시) + "개별주를 보유하면 열립니다" 잠금 카드 확인.

- [x] T003 [P] [US1] `EtfSnapshotCard` 컴포넌트 생성 — `src/components/growth/EtfSnapshotCard.tsx`. Props: `{ slices: Array<{ symbol: string; name: string; weight: number; ter: number | null }>; weightedAvgTer: number | null }`. 제목 "📦 내 ETF 포트폴리오". 종목별 행: 종목명 + 비중 % (상위 5개, 초과 시 "외 N개" 텍스트). 가중평균 TER 행: weightedAvgTer 있으면 `연간 보수 {pct(weightedAvgTer, 2)}` 표시, null이면 TER 행 숨김. 스타일: `rounded-2xl bg-card p-5 shadow-card`.
- [x] T004 [US1] `src/app/growth/page.tsx` JSX 수정 — BusinessSnapshotStreamed 위치에 `hasStock ? <Suspense><BusinessSnapshotStreamed .../></Suspense> : <LockedCard title="🏭 내 지분 실적" description="개별주를 보유하면 열립니다" />` 교체. 그 아래에 `hasEtf ? <EtfSnapshotCard slices={etfSlices} weightedAvgTer={weightedAvgTer} /> : <LockedCard title="📦 ETF 포트폴리오" description="ETF를 보유하면 열립니다" />` 추가. 필요한 import 추가.

**Checkpoint**: ETF만 보유 계좌에서 `/growth` 정상 렌더 확인.

---

## Phase 4: User Story 2 — 기업 스냅샷 잠금 해제 (Priority: P2)

**Goal**: 개별주 추가 시 기업 스냅샷 카드가 활성화되고 ETF 현황 카드도 함께 유지. 전량 매도 시 다시 잠금.

**Independent Test**: ETF만 보유 계좌에 개별주 1개 추가 → 기업 스냅샷 활성 + ETF 현황 유지. 개별주 전량 매도 → 기업 스냅샷 다시 잠금.

- [x] T005 [US2] T004의 `hasStock` 분기가 매도 후에도 올바르게 동작하는지 확인. `data.allocation`은 수량 > 0인 포지션만 포함하므로 전량 매도 후에는 `hasStock = false`로 자동 전환됨 — 별도 코드 변경 없이 T002 로직으로 처리. 혼합 포트폴리오(ETF + 개별주 동시 보유) 수동 검증.

**Checkpoint**: 개별주 매수/매도 시 기업 스냅샷 카드 상태 자동 전환 확인.

---

## Phase 5: User Story 3 — 신규 사용자 온보딩 (Priority: P3)

**Goal**: 보유 종목이 전혀 없는 신규 사용자가 `/growth` 진입 시 빈 화면 대신 두 카드 모두 잠금 상태로 표시.

**Independent Test**: 보유 종목 0개 계좌로 `/growth` 진입 → "개별주를 보유하면 열립니다" + "ETF를 보유하면 열립니다" 두 잠금 카드 표시. 기존 GrowthCardSkeleton 대신 잠금 카드가 렌더되는 것 확인.

- [x] T006 [US3] `src/app/growth/page.tsx` — `data.allocation.length === 0` 케이스 확인. `hasEtf = false`, `hasStock = false`이면 T004 JSX에서 두 카드 모두 LockedCard로 렌더 → 추가 코드 변경 없음. 신규 계좌로 수동 검증.

**Checkpoint**: 아무것도 없는 계좌에서 두 잠금 카드 + 티어 카드 + 규율 점수 카드 표시 확인.

---

## Phase 6: Polish

- [x] T007 [P] TypeScript + ESLint 검사 — `npx tsc --noEmit && npx eslint src/app/growth/page.tsx src/components/growth/EtfSnapshotCard.tsx src/components/growth/LockedCard.tsx`
- [ ] T008 quickstart.md 검증 시나리오 4가지 수동 실행 — ETF만 / 개별주만 / 둘 다 / 아무것도 없음

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: 즉시 시작 가능 — T001·T002 병렬 실행 가능
- **US1 (Phase 3)**: T001·T002 완료 후 — T003·T004 순차(T003 먼저)
- **US2 (Phase 4)**: T004 완료 후 — T005는 검증 태스크
- **US3 (Phase 5)**: T004 완료 후 — T006는 검증 태스크
- **Polish (Phase 6)**: 모든 구현 완료 후

### Parallel Opportunities

- T001·T002: 다른 파일 → 병렬 실행 가능
- T003: T001 완료 시 즉시 시작 가능 (T002와 무관)
- T005·T006: T004 완료 시 병렬 가능 (검증만)

---

## Parallel Example: Phase 2

```
동시 실행:
  T001 — LockedCard 컴포넌트 생성 (src/components/growth/LockedCard.tsx)
  T002 — growth page 분류 로직 (src/app/growth/page.tsx)

T001 완료 즉시:
  T003 — EtfSnapshotCard 컴포넌트 생성 (T002 완료 기다릴 필요 없음)

T002·T003 모두 완료 후:
  T004 — JSX 배치 수정
```

---

## Implementation Strategy

### MVP (US1 단독)

1. T001 + T002 동시 (Foundational)
2. T003 → T004 (US1)
3. 검증: ETF만 보유 계좌로 `/growth` 확인
4. **여기서 멈추고 데모 가능** — ETF 투자자 문제 해결됨

### Full 구현

1. Phase 2 완료
2. Phase 3 완료 (MVP)
3. Phase 4 완료 (US2 — 전량 매도 케이스)
4. Phase 5 완료 (US3 — 신규 사용자)
5. Phase 6 완료 (타입 체크·수동 검증)

---

## Notes

- T005·T006은 별도 코드 변경이 없을 가능성이 높음 — T002·T004 로직이 자동으로 커버
- TER은 한국 ETF(6자리 코드)만 표시됨 — 미국 ETF는 `weightedAvgTer` 계산에서 자동 제외
- 섹터 데이터는 이 스펙 범위 밖 (research.md 결정: MVP 생략)
