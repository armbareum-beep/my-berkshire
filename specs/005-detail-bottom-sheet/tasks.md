# Tasks: 상세 바텀시트(드롭시트) — 체감 속도 개선

**Input**: Design documents from `/specs/005-detail-bottom-sheet/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: 자동화 테스트는 요청되지 않음(이 repo는 verify/run 스킬로 수동 검증 + `tsc`/`eslint`/`next build` 게이트). 따라서 테스트 태스크 대신 각 스토리에 **검증 체크포인트**를 둔다.

**Organization**: 태스크는 사용자 스토리별로 묶여 독립 구현·검증이 가능하다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일·선행 의존 없음 → 병렬 가능
- **[Story]**: US1/US2/US3/US4 (spec.md 사용자 스토리)
- 모든 태스크에 정확한 파일 경로 포함

## Path Conventions

단일 Next App Router 프로젝트 — `src/app/`, `src/components/`, `src/lib/` (repo 루트 기준).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: `@sheet` 병렬 슬롯 골격과 v16 필수 파일

- [x] T001 [P] `src/app/@sheet/default.tsx` 생성 — `null` 반환(v16 필수, 하드 내비 시 시트 없음 → FR-008). contracts/route-structure.md 참조
- [x] T002 [P] `src/app/@sheet/[...catchAll]/page.tsx` 생성 — `null` 반환(시트 열린 채 비대상 라우트 이동 시 슬롯 비움 → US3). contracts/route-structure.md 참조
- [x] T003 `src/app/layout.tsx` 수정 — `sheet` 슬롯 prop 추가하고 `max-w-[480px]` 컨테이너 뒤에 `{sheet}` 렌더
- [x] T004 `next build` 실행 — 병렬 슬롯 `default.js` 요구사항 충족 확인. 빌드가 `src/app/default.tsx`(children 슬롯)도 요구하면 `null`/`notFound()`로 추가

**Checkpoint**: 슬롯 골격이 빌드를 통과 — 시트 셸·인터셉터 작업 시작 가능

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 모든 인터셉터가 의존하는 시트 셸. 이 단계 전에는 어떤 스토리도 동작 불가

**⚠️ CRITICAL**: T005 완료 전 사용자 스토리 진행 불가

- [x] T005 `src/components/ui/Sheet.tsx` 작성(client component) — contracts/sheet-component.md의 SH-1~SH-8 전부:
  - 슬라이드 인 `translateY(100%)→0` ≤250ms ease-out, `prefers-reduced-motion` 존중 (SH-1, FR-011)
  - 닫기 4종: X 버튼 · 배경(backdrop) 탭 · 아래로 스와이프(터치 이벤트 직접 구현, 신규 의존 금지) · 브라우저 back. ①②③은 닫힘 애니메이션 후 `router.back()` (SH-2/3, FR-002, SC-005)
  - 배경 스크롤 락 + 시트 내부만 스크롤 (SH-4/5, FR-004/005)
  - `position:fixed`, `max-w-[480px]` 중앙 컬럼 정렬·하단 고정·상단 peek (SH-6, FR-005a)
  - `fullHref` prop 제공 시 "전체 보기" **하드 내비(`<a href>`)** 링크 노출 (SH-7, FR-007)
  - `role="dialog"` `aria-modal` `aria-label`, X `aria-label="닫기"`, 포커스 이동/복귀

**Checkpoint**: `<Sheet>` 준비 — 라우트별 인터셉터를 붙일 수 있음

---

## Phase 3: User Story 1 — 홈의 조회형 섹션을 시트로 (Priority: P1) 🎯 MVP

**Goal**: 홈의 정보 조회형 섹션 카드/배너(리포트·순자산·투시·공시·연혁)를 탭하면 시트로 열리고, 4종으로 닫으면 홈이 스크롤 위치 그대로 복원된다.

**Independent Test**: 홈에서 리포트(또는 공시·순자산) 섹션 탭 → 시트 슬라이드 인 → X로 닫으면 같은 스크롤 위치의 홈으로 복귀.

### 내용 컴포넌트 추출 (크롬 제거 — research D4)

- [x] T006 [P] [US1] `src/app/report/page.tsx`에서 본문을 `src/app/report/ReportContent.tsx`로 추출(BackButton·BottomTabBar 크롬 제외). 라우트 page = 크롬 + `<ReportContent/>`
- [x] T007 [P] [US1] `src/app/networth/page.tsx` → `src/app/networth/NetworthContent.tsx` 추출, page = 크롬 + Content
- [x] T008 [P] [US1] `src/app/lookthrough/page.tsx` → `src/app/lookthrough/LookThroughContent.tsx` 추출, page = 크롬 + Content
- [x] T009 [P] [US1] `src/app/disclosures/page.tsx` → `src/app/disclosures/DisclosuresContent.tsx` 추출, page = 크롬 + Content
- [x] T010 [P] [US1] ✅ **작업형으로 확정(2026-06-22 사용자 결정)** — `/company`는 회사명 변경·전환·삭제·신규설립 **편집/관리** 페이지(FR-001b 작업형). 시트화하지 않고 기존 전체 페이지 유지. 추가 작업 없음

### 인터셉터 (각 태스크는 해당 Content 추출에 의존)

- [x] T011 [P] [US1] `src/app/@sheet/(.)report/page.tsx` 생성 — `<Sheet fullHref="/report"><ReportContent/></Sheet>` (T006 의존)
- [x] T012 [P] [US1] `src/app/@sheet/(.)networth/page.tsx` — `<Sheet fullHref="/networth"><NetworthContent/></Sheet>` (T007 의존)
- [x] T013 [P] [US1] `src/app/@sheet/(.)lookthrough/page.tsx` — `<Sheet fullHref="/lookthrough"><LookThroughContent/></Sheet>` (T008 의존)
- [x] T014 [P] [US1] `src/app/@sheet/(.)disclosures/page.tsx` — `<Sheet fullHref="/disclosures"><DisclosuresContent/></Sheet>` (T009 의존)
- [x] T015 [P] [US1] ✅ **불필요** — T010 결정으로 `/company` 인터셉터 생성 안 함(작업형). catch-all이 시트 비움

### 진입 링크 스크롤 보존

- [x] T016 [US1] `scroll={false}` 추가 — report(dashboard:654)·disclosures(dashboard:788)·lookthrough(dashboard:959)·networth(cards.tsx:123). company는 보류(T010) (SC-002, research D6)

**Checkpoint**: 홈 조회형 섹션이 시트로 열리고 4종 닫기·스크롤 보존 동작 — US1 독립 검증 가능 (MVP)

---

## Phase 4: User Story 2 — 종목·지수 상세를 시트로 (Priority: P1)

**Goal**: 보유 목록·구성·검색 결과에서 종목/지수를 탭하면 상세 시트가 열리고, 닫으면 직전 목록/검색 상태가 유지된다.

**Independent Test**: 보유 목록 또는 검색 결과에서 종목 탭 → 상세 시트 → 닫으면 목록/검색어 유지.

- [x] T017 [P] [US2] `src/app/stocks/[symbol]/page.tsx` 본문을 **인파일 `export StockDetailContent`** 로 추출(크롬 제외). page = 셸 + `<StockDetailContent symbol sp/>`. (~700줄이라 헬퍼는 그대로 두고 시그니처/래퍼만 분리해 회귀 위험 최소화)
- [x] T018 [P] [US2] `src/app/index/[symbol]/page.tsx` → 인파일 `export IndexDetailContent` 추출, page = 셸 + Content
- [x] T019 [P] [US2] `src/app/@sheet/(.)stocks/[symbol]/page.tsx` 생성 — `<Sheet fullHref><StockDetailContent/></Sheet>`. Playwright 검증: 풀스크린·카드 5개·매수하기·닫기→/holdings ✅
- [x] T020 [P] [US2] `src/app/@sheet/(.)index/[symbol]/page.tsx` 생성 — `<Sheet fullHref><IndexDetailContent/></Sheet>`. (빌드에 `/(.)index/[symbol]` 등록 확인 — UI는 동일 패턴, 검색 진입 별도 검증 권장)
- [x] T021 [US2] 종목 진입 `<Link scroll={false}>` — `AccountGroups.tsx`(보유), `ui/StockRow.tsx`(구성·공용). 검색(`SearchEntry`)은 별도 화면이라 폴리시로 미룸
- [x] T022 [US2] `/stocks/[symbol]/disclosures` 하위 라우트는 인터셉터 없음 → 전체 페이지 유지(빌드 라우트 표 확인). 인터셉터 추가 안 함

**Checkpoint**: 종목·지수 상세가 시트로 열리고 목록/검색 상태 보존 — US1·US2 독립 동작

---

## Phase 5: User Story 3 — 입력·작업 페이지는 시트로 가두지 않음 (Priority: P1)

**Goal**: 거래기록·리밸런싱·가져오기·계좌관리는 시트가 아니라 전체 페이지로 이동한다.

**Independent Test**: 홈에서 "거래내역 가져오기"(또는 리밸런싱 배너) 탭 → 시트 아닌 전체 페이지 이동.

- [x] T023 [US3] 작업형 라우트에 인터셉터 없음 확정 — `@sheet/` 하위 transactions·rebalance·import·accounts 폴더 없음 확인 ✅
- [x] T024 [US3] Playwright 검증 — ① 홈→/transactions: dialog 0(전체 페이지) ② 종목 시트 내 매수하기→/transactions: dialog 0(catch-all이 시트 닫음). 둘 다 통과 ✅

**Checkpoint**: 조회형/작업형 경계가 정확 — 작업 페이지는 전체 화면 유지

---

## Phase 6: User Story 4 — 전체 보기 & 딥링크 (Priority: P3)

**Goal**: 시트의 "전체 보기"로 전체 페이지 이동, 외부 딥링크/새로고침은 전체 페이지.

**Independent Test**: 시트 "전체 보기" → 전체 페이지 / `/stocks/AAPL` 직접 진입·새로고침 → 전체 페이지.

- [ ] T025 [US4] 모든 인터셉터가 올바른 `fullHref`를 `<Sheet>`에 전달하는지, "전체 보기"가 하드 내비로 전체 페이지로 가는지 점검(재인터셉트 안 됨 — research D7)
- [ ] T026 [US4] 딥링크/새로고침 시 `children`=전체 page, `@sheet`=`default`(null)로 전체 페이지 렌더 검증 (FR-008) — `/stocks/[symbol]`·`/report` 등 표본

**Checkpoint**: 공유·딥링크 경로 보존, 시트는 앱 내부 진입점으로만 동작

---

## Phase 7: 추가 조회형 라우트 (Priority: P2 — US1 확장)

**Goal**: 보유 현황·배당 일정·연간 리포트도 시트로(plan D7의 P2 묶음).

- [x] T027 [P] [US1] `holdings` Content 추출(`export HoldingsContent`) + `@sheet/(.)holdings` 인터셉터. Playwright 검증: 풀스크린·카드 4 ✅
- [x] T028 [P] [US1] `dividends` Content 추출(`export DividendsContent`) + `@sheet/(.)dividends` 인터셉터. Playwright 검증: 풀스크린·카드 4 ✅
- [x] T029 [P] [US1] ✅ **전체 페이지 유지로 결정** — `/annual-report`는 `print:` 레이아웃의 **인쇄·공유용 문서**라 fixed/portal 시트가 인쇄를 깨뜨림. 조회형이지만 문서 특성상 전체 페이지가 적절(전체 보기 경로와 일관)
- [x] T030b [P] [US1] (사용자 요청 추가) `/cash` 현금 시트 — CashContent 추출 + `@sheet/(.)cash` + 현금비중 카드 scroll={false}. Playwright 풀스크린 검증 ✅
- [x] T030c [P] [US1] (사용자 요청 추가) `/style` 운용스타일 시트 — StyleContent 추출 + `@sheet/(.)style` + StyleCard scroll={false}. Playwright 풀스크린 검증 ✅
- [x] T030d (버그 수정) 하단 탭바 고정 — `@keyframes page-in`의 영구 transform이 `.animate-page-in`을 컨테이닝 블록으로 만들어 BottomTabBar(fixed)가 콘텐츠 하단에 갇히던 버그. page-in을 opacity-only로 변경(rise는 stagger 담당). Playwright: 긴 페이지 nav bottom=뷰포트(896) ✅

**Checkpoint**: 홈의 조회형 섹션 전체가 시트 지원

---

## Phase 8: Polish & Cross-Cutting Concerns

- [x] T030 [P] Sheet 모션 절제 — CSS `sheet-in` 220ms ease-out 단일 슬라이드, 그라데이션 없음, `motion-reduce:animate-none`. (헌장 IV 부합)
- [x] T031 ✅ 불필요 — 모든 대상 라우트가 Content 분리 완료라 CSS 폴백 불요. (대신 핵심 발견: **portal로 transform 래퍼 탈출** 필수 — 메모리에 기록)
- [x] T032 [P] 전 피처 파일 `tsc --noEmit`·`eslint` 클린 (scripts/의 기존 KRX 에러는 무관)
- [x] T033 `next build` 통과 — 인터셉터 전부 등록(`/(.)report·networth·lookthrough·disclosures·stocks·index·holdings·dividends`)
- [x] T034 Playwright(dev-login)로 핵심 시나리오 검증 — 리포트·종목·보유·배당 시트 풀스크린 표시, X 닫기→복귀, US3 경계(작업형 전체페이지+catch-all 닫힘). 스와이프 제스처는 실기기 확인 권장

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)**: 즉시 시작. T003은 T001/T002 후, T004는 T001~T003 후
- **Foundational (P2)**: Setup 후. **모든 사용자 스토리를 블록**
- **User Stories (P3~P6)**: Foundational(T005) 후 시작. US1·US2는 서로 독립(병렬 가능), US3·US4는 주로 검증이라 US1/US2 일부 완료 후 의미 있음
- **Phase 7(P2 확장)**: Foundational 후, US1 패턴 확립 후 권장
- **Polish (P8)**: 원하는 스토리 완료 후

### User Story Dependencies

- **US1 (P1)**: Foundational 후 시작 — 다른 스토리 비의존 (MVP)
- **US2 (P1)**: Foundational 후 시작 — US1과 독립(같은 `<Sheet>` 재사용)
- **US3 (P1)**: catch-all(T002) + 인터셉터 일부 존재 시 검증 가능 — 구현은 "인터셉터 미생성"이라 거의 검증 중심
- **US4 (P3)**: 인터셉터들이 `fullHref` 전달하면 검증 가능

### Within Each User Story

- 내용 컴포넌트 추출(`*Content`) → 인터셉터(해당 Content 의존) → 진입 Link `scroll={false}`

### Parallel Opportunities

- T001, T002 병렬
- US1 추출 T006~T010 병렬, 이어서 인터셉터 T011~T015 병렬
- US2 추출 T017/T018 병렬, 인터셉터 T019/T020 병렬
- Foundational(T005) 완료 후 US1·US2를 다른 작업자가 병렬 진행 가능
- Phase 7 T027~T029 병렬

---

## Parallel Example: User Story 1

```bash
# 내용 컴포넌트 추출(서로 다른 라우트 파일) 동시 실행:
Task: "Extract ReportContent in src/app/report/ReportContent.tsx"
Task: "Extract NetworthContent in src/app/networth/NetworthContent.tsx"
Task: "Extract LookThroughContent in src/app/lookthrough/LookThroughContent.tsx"
Task: "Extract DisclosuresContent in src/app/disclosures/DisclosuresContent.tsx"
Task: "Extract CompanyContent in src/app/company/CompanyContent.tsx"

# 그 다음 인터셉터(각자 Content 의존) 동시 실행:
Task: "Interceptor src/app/@sheet/(.)report/page.tsx"
Task: "Interceptor src/app/@sheet/(.)networth/page.tsx"
...
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup → 2. Phase 2 Foundational(`<Sheet>`) → 3. Phase 3 US1
4. **STOP & VALIDATE**: 홈 조회형 섹션 시트를 독립 검증(4종 닫기·스크롤 보존)
5. 준비되면 데모/배포

> 대안 첫 슬라이스: US2의 `(.)stocks/[symbol]` 한 라우트만 먼저 끝내 인터셉트 메커니즘을 가장 빨리 검증한 뒤 US1로 확장(quickstart 권장).

### Incremental Delivery

1. Setup + Foundational → 기반 완성
2. US1 → 독립 검증 → 데모(MVP)
3. US2 → 독립 검증 → 데모
4. US3·US4 검증으로 경계·딥링크 확정
5. Phase 7로 조회형 라우트 전체 커버, Phase 8로 다듬기

---

## Notes

- [P] = 다른 파일·선행 의존 없음. 인터셉터는 해당 Content 추출 완료 후 병렬.
- 신규 외부 의존 추가 금지(스와이프 직접 구현).
- 기존 상세 페이지·계산 결과 불변(회귀 확인) — 헌장 III·V.
- 각 체크포인트에서 스토리 독립 검증 후 다음으로.
