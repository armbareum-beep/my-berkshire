# Tasks: 부동산 사업부 (Real Estate Division)

**Input**: Design documents from `/specs/011-real-estate-division/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: 포함됨 — quickstart.md가 Vitest 단위테스트를 요구(순수 계산 함수). DB 변경은 마이그레이션·RLS·타입 재생성을 코드보다 먼저.

**Organization**: User Story별 그룹. 우선순위: US1(P1) → US2·US4(P2) → US3(P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 병렬 가능(다른 파일, 미완 의존 없음)

## Path Conventions

단일 Next.js 웹앱. 마이그레이션 `supabase/migrations/`, 계산 `src/lib/finance/`, 로더 `src/lib/`, 액션 `src/app/networth/`, 표시 `src/components/networth/`·`src/app/dashboard/`.

---

## Phase 1: Setup

**Purpose**: 마이그레이션 파일 작성(아직 적용 전).

- [x] T001 `supabase/migrations/<UTC ts>_real_estate_division.sql` 작성 — `manual_assets`에 `acquisition_cost`·`valuation_source`·`valued_at`·`sale_price`·`sale_at`·`sale_cost`(전부 nullable) 추가, `manual_asset_income` 테이블 신규(id·holding_id·manual_asset_id·date·amount·cost·note·created_at·deleted_at) + RLS 4정책(`holdings.user_id = auth.uid()` 스코프). data-model.md 스키마 따름

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 스키마 적용 + 계산 엔진. 완료 전 어떤 스토리도 착수 불가. (헌장: 스키마/RLS·타입을 코드보다 먼저)

- [x] T002 마이그레이션 적용(Supabase) 후 `src/lib/supabase/database.types.ts` 재생성·커밋. 적용/재생성 확인
- [x] T003 `src/lib/finance/realAssets.ts` — `ManualAsset` 타입 확장(acquisitionCost·valuationSource·valuedAt·salePrice·saleAt·saleCost) + `ManualAssetIncome` 타입 추가
- [x] T004 `src/lib/realAssets.ts` — 로더 확장: `loadManualAssets` 새 컬럼 매핑 + `loadManualAssetIncome(holdingId)` 추가(소프트삭제 제외)
- [x] T005 [P] `src/lib/finance/realAssets.test.ts` (신규) — effectiveCost·미실현·임대 net·매도차익 net·취득가없음 케이스 (quickstart 1·2·3·4·7)
- [x] T006 `src/lib/finance/realAssets.ts` — 파생 함수: `effectiveCost`·`isSold`·`unrealizedGain`·`saleGain`·`rentNet`·`computeRealEstateDivision(assets, incomes)`(realized=임대+매도차익 net, unrealized=평가차익, cost=실질취득가, ret 분해)
- [x] T007 `src/lib/finance/businessReturns.ts` + `businessReturns.test.ts` — 부동산 division 입력을 `computeRealEstateDivision` 결과(manualCost=cost, manualGain=gain)로 공급하도록 연결. 주식 XIRR·events 불변 확인 케이스 추가

**Checkpoint**: 스키마·엔진 준비 — 스토리 착수 가능.

---

## Phase 3: User Story 1 - 홈에서 부동산을 하나의 사업부로 본다 (P1) 🎯 MVP

**Goal**: 홈/순자산에서 부동산이 독립 사업부로 보이고(평가차익 미실현), 홈 순서가 보유계좌 → 주식 자산구성 → 부동산 사업부 → 현금.

**Independent Test**: 취득가·현재가 있는 부동산 → 부동산 사업부 카드에 평가차익 표시, 홈 순서 일치, 부동산 없으면 카드 미표시.

- [x] T008 [US1] `src/components/networth/BusinessReturnsCard.tsx` — 부동산 division을 실현/미실현 분해로 표시(US1 단계선 미실현 위주, 실현 0)
- [x] T009 [US1] `src/app/dashboard/page.tsx` `HoldingsStreamed` — 순서 재배치(보유계좌 → AllocationCard → 부동산 사업부 카드 → CashCard) + 부동산 사업부 카드 추가(자산 없으면 미표시, FR-008)
- [x] T010 [US1] `src/components/networth/ManualAssetsSection.tsx` — 자산별 미실현 평가차익을 실질취득가 기준으로 표시(기존 manualAssetGain → division 계산 사용)

**Checkpoint**: US1 단독 배포 가능 — 부동산이 홈에서 사업부로 보임.

---

## Phase 4: User Story 2 - 임대수익 기록 → 실현 (P2)

**Goal**: 부동산별 임대수익(날짜·금액·비용 단일) 기록, 실현으로 누적, 미실현과 분리. 주식 지표 불변.

**Independent Test**: 임대 기록 시 사업부 실현(임대 net) 누적·표시, 주식 XIRR/투입원금/복리무중단 불변.

- [x] T011 [P] [US2] `src/lib/finance/realAssets.test.ts` — 임대 여러 건 net 누적·assetId 귀속 테스트
- [x] T012 [US2] `src/app/networth/actions.ts` — `addManualAssetIncome`·`deleteManualAssetIncome` 액션(자산별 date·amount·cost), `/networth`·`/dashboard` revalidate
- [x] T013 [US2] `src/components/networth/ManualAssetsSection.tsx` — 자산별 임대수익 입력/이력 UI(비용 단일 필드) + 실현(임대) 표시

**Checkpoint**: 임대로 실현수익이 쌓이는 "수익 내는 사업부" 동작.

---

## Phase 5: User Story 4 - 부동산 매도 → 매도차익 실현 (P2)

**Goal**: 매도(가·일·비용 단일) 기록 시 미실현에서 제외, 매도차익 실현 누적, 이력 보존. 매도 대금 events 미연동.

**Independent Test**: 매도 기록 → 자산이 미실현에서 사라지고 매도차익(net)이 실현에, 매도 이력 표시.

- [x] T014 [P] [US4] `src/lib/finance/realAssets.test.ts` — 매도 net 차익·미실현 제외·이력 보존 테스트
- [x] T015 [US4] `src/app/networth/actions.ts` — `sellManualAsset(id, {salePrice, saleAt, saleCost})` 액션(매도 처리), revalidate
- [x] T016 [US4] `src/components/networth/ManualAssetsSection.tsx` — 매도 입력 + 매도 자산 이력 표시(매도일·매도가·차익), 보유 목록에서 분리

**Checkpoint**: 실현 그림 완성(임대 + 매도차익).

---

## Phase 6: User Story 3 - 정직한 평가: 출처·갱신일·입력 안전장치 (P3)

**Goal**: 취득비용·평가출처·평가일 입력/표시, 현재가<매입가 입력 안전장치.

**Independent Test**: 출처·평가일 저장·표시, 현재가<매입가 시 확인 안내.

- [x] T017 [US3] `src/components/networth/ManualAssetForm.tsx` — 필드 추가(취득 부대비용·평가 출처·평가일, 모두 선택) + **현재가 < 매입가 저장 시 확인 안내**(FR-006)
- [x] T018 [US3] `src/app/networth/actions.ts` — `ManualAssetInput`에 acquisitionCost·valuationSource·valuedAt 추가, insert/update 컬럼 반영
- [x] T019 [US3] `src/components/networth/ManualAssetsSection.tsx`·`BusinessReturnsCard.tsx` — "추정 · {출처} · {평가일}" 표기, 취득비용을 실질취득가에 반영

**Checkpoint**: 추정 수치 정직성 레이어 완비.

---

## Phase 7: Polish & Cross-Cutting

- [x] T020 [P] 변경 파일 `npx tsc --noEmit` · `npx eslint` 클린, `npx vitest run` 전체 통과 확인
- [x] T021 [P] 회귀 확인 — 주식 수익률·XIRR·복리무중단·총자산 누적수익률(부동산 無일 때) 불변, 기존 수기자산 표시 하위호환
- [ ] T022 `run`/`verify` 스킬로 quickstart.md 수동 시나리오(안전장치·평가차익·출처·임대·매도·비용 net·홈 순서·빈 사업부) 검증

---

## Dependencies & Execution Order

- **Phase 1 → 2**: 마이그레이션 파일 작성 → 적용·타입 재생성(T002). **스키마/타입이 코드보다 먼저**(헌장).
- **Phase 2 → 모든 스토리**: T003~T007(타입·로더·계산 엔진·businessReturns 연결)이 전제.
- **스토리 순서**: US1(P1) → US2·US4(P2) → US3(P3). US2/US4/US3는 같은 `ManualAssetsSection`/`actions.ts`를 건드리므로 파일 충돌 피해 순차 권장.
- **Phase 7**: 전체 구현 후.

### Story Independence
- **US1**: 미실현 평가차익 + 홈 카드/재배치만으로 단독 MVP.
- **US2/US4**: 실현(임대/매도) 입력을 더함 — 엔진은 Phase 2에 이미 있음, 스토리는 입력 UI·액션.
- **US3**: 추정 정직성(출처·평가일·안전장치) 레이어.

## Parallel Opportunities
- 각 스토리 테스트(T005·T011·T014) [P] — 구현 전 작성(TDD).
- Phase 7 T020·T021 [P].
- US2·US4는 로직상 독립이나 `ManualAssetsSection`/`actions.ts` 공유라 파일 단위로는 순차 권장.

## Implementation Strategy
1. **선행**: Phase 1·2 — 마이그레이션·타입·계산 엔진(여기서 막히면 스토리 불가).
2. **MVP = US1**: 부동산이 홈에서 사업부로 보임(미실현).
3. **증분**: US2(임대) → US4(매도) → US3(정직 평가).
4. **마무리**: Phase 7 품질·회귀·수동검증.

**총 22개 태스크** — Setup 1 / Foundational 6 / US1 3 / US2 3 / US4 3 / US3 3 / Polish 3.
