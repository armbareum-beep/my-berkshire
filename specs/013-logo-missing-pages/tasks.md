---
description: "Task list for 013-logo-missing-pages"
---

# Tasks: 트랜잭션·자산배분 화면 종목 로고 적용

**Input**: Design documents from `/specs/013-logo-missing-pages/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ui-contracts.md, quickstart.md

**Tests**: 명세가 TDD를 명시하진 않았으나, 헌장 품질 게이트(순수 함수엔 단위테스트)에 따라 증권사
로고 후보 순수 함수에 한해 단위테스트 1건만 포함(나머지는 화면 육안 검증).

**Organization**: 작업은 사용자 스토리별로 묶어 독립 구현·검증이 가능하게 한다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 병렬 가능(서로 다른 파일, 미완 작업에 비의존)
- **[Story]**: US1/US2/US3
- 파일 경로는 명시

## Path Conventions

Next.js 단일 앱. 소스는 리포 루트 `src/`, 정적 에셋은 `public/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 선택적 셀프호스팅 로고 자리 마련(없어도 favicon 폴백으로 동작).

- [X] T001 [P] `public/brokers/` 디렉터리 생성(셀프호스팅 증권사 로고용 자리) — `public/brokers/.gitkeep` 추가

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 모든 로고 표시가 공유하는 폴백 프리미티브. US3(증권사 배지)가 직접 의존하며, `Avatar`
일관성도 여기서 단일화한다(원칙 V).

**⚠️ CRITICAL**: T003은 US3 시작 전 완료 필요. US1/US2는 `Avatar`/`SymbolAvatar` 공개 API만 쓰므로
이 단계와 독립적으로도 진행 가능(리팩터는 동작 보존이라 영향 없음).

- [X] T002 [P] `src/components/ui/LogoImage.tsx` 신규 — 계약 C1대로 순차 폴백 `<img>` 프리미티브
  (`srcs`, `alt`, `fit`, `resetKey`, `fallback`; `onError`로 다음 후보 전진, 끝나면 `fallback`,
  `resetKey` 변경 시 인덱스 0 리셋, 깨진 이미지 비노출)
- [X] T003 `src/components/ui/Avatar.tsx` 리팩터 — 내부 `<img>`/failIdx/onError 로직을 `LogoImage`로
  위임(계약 C2, 동작 보존). `assetImage`의 `srcs/fit` 전달, `fallback`=기존 `brandLogoLabel` 이니셜+색
  배지 그대로. (depends T002)
- [X] T003b SSR hydration 타이밍 버그 수정 — Next.js SSR 시 `.svg` 404가 hydrate 전 발생하면
  `onError`를 놓쳐 깨진 이미지가 영구 잔류하던 문제. `LogoImage.tsx`에 `useRef`+`useEffect` 추가:
  마운트 후 `img.complete && img.naturalWidth===0` 이면 다음 후보로 진행. 아울러
  `assetImage.ts`의 `localLogos` 순서를 `.png`→`.svg`로 변경(대부분 로고가 `.png`라 첫 시도 성공률 향상).

**Checkpoint**: 공용 폴백 프리미티브 준비 완료 — 증권사 배지가 같은 메커니즘을 재사용할 수 있음.

---

## Phase 3: User Story 1 - 자산배분 화면에서 종목 로고 보기 (Priority: P1) 🎯 MVP

**Goal**: 자산배분 종목 목록(전체 종목·유형별)에서 각 종목 행이 보유 목록과 동일한 브랜드 로고로 표시.

**Independent Test**: 둘 이상 종목 보유 포트폴리오로 `/allocation/stock`·`/allocation/sleeve/[type]`를
열어 각 종목 행 아이콘이 보유 목록과 같은 로고로 뜨고, 현금 행은 글자 폴백인지 확인.

### Implementation for User Story 1

- [X] T004 [P] [US1] `src/app/allocation/stock/page.tsx` — 종목 목록 아이템 매핑에 `symbol: a.symbol`
  추가(현금 합성 행은 `symbol` 미포함), 목록 렌더를 `<SymbolAvatar name={it.label} symbol={it.symbol} />`
  로 변경(약 121행). 도넛용 `top/rest/slices` 파생은 그대로(추가 필드 무해).
- [X] T005 [P] [US1] `src/app/allocation/sleeve/[type]/page.tsx` — `items` 매핑에 `symbol: a.symbol`
  추가, 목록 렌더를 `<SymbolAvatar name={it.label} symbol={it.symbol} />`로 변경(약 104행).

**Checkpoint**: 자산배분 종목 로고 동작·독립 검증 가능(MVP). 현금 행은 폴백 유지(SC-002).

---

## Phase 4: User Story 2 - 거래 내역에서 종목 식별하기 (Priority: P2)

**Goal**: 거래 내역에서 종목 연결 거래(매수/매도/배당)는 종목 로고로, 비종목 거래(입금/출금/환전)는
기존 유형 아이콘으로 표시하되 거래유형 정보(텍스트 라벨·금액 색)는 유지.

**Independent Test**: 한 종목의 매수·매도·배당과 입출금·환전이 섞인 내역을 열어, 종목 거래엔 종목
로고가, 비종목 거래엔 유형 아이콘이 뜨고 유형 라벨이 모두 유지되는지 확인.

### Implementation for User Story 2

- [X] T006 [US2] `src/components/transactions/ActivityList.tsx` — `Avatar` import 후, 행 선두 아이콘을
  분기: `it.symbol`이 truthy면 `<Avatar symbol={it.symbol} name={names[it.symbol] ?? findCatalogItem(it.symbol)?.name ?? it.symbol} size="md" />`,
  아니면 기존 `<IconChip icon={EVENT_ICON[it.type]} size="md" type={it.type} />` 유지(약 175행).
  굵은 유형 라벨(`LABEL[it.type]`)·금액 부호/색은 그대로(계약 C4.1~C4.3).

**Checkpoint**: US1·US2 모두 독립 동작. 로고 없는 종목도 폴백으로 무중단(SC-003).

---

## Phase 5: User Story 3 - 계좌에 증권사 로고 보기 (Priority: P2)

**Goal**: 계좌 화면에서 각 계좌가 증권사 로고로 표시, 로고 에셋·도메인이 없으면 기존 이니셜+색 배지로
폴백(종목 로고와 동일 파이프라인 재사용).

**Independent Test**: 서로 다른 증권사 계좌 2개를 만들어 `/accounts`에서 각 계좌가 증권사 로고(또는
favicon)로, 직접입력/미지정 계좌는 이니셜+색으로 뜨고 깨진 이미지가 없는지 확인.

### Implementation for User Story 3

- [X] T007 [P] [US3] `src/lib/config/brokers.ts` — `Broker` 인터페이스에 `domain?: string` 추가하고
  9개 프리셋(toss/kiwoom/korea/mirae/samsung/nh/kb/shinhan/daishin)에 공식 도메인 채움.
- [X] T008 [US3] 증권사 로고 후보 순수 함수 추가 — `src/lib/config/brokers.ts`에
  `brokerLogoSrcs(broker): string[]` (= `['/brokers/{id}.svg','/brokers/{id}.png', domain && gfavicon(domain)]`
  필터링; data-model §4). `gfavicon`은 `src/lib/finance/assetImage.ts`에서 `export`로 노출해 재사용
  (중복 금지, 원칙 V). (depends T007)
- [X] T009 [US3] `src/components/accounts/BrokerSelect.tsx`의 `BrokerChip`을 `LogoImage`로 전환 —
  `srcs=brokerLogoSrcs(b)`, `fit="inset"`, `resetKey=id`, `fallback`=기존 이니셜(name[0])+`color` 배지.
  `findBroker(id)` 없으면 `null` 유지(계약 C5). (depends T002, T008)
- [X] T010 [P] [US3] 단위테스트 — `src/lib/config/brokers.test.ts`에서 `brokerLogoSrcs` 검증(후보 순서,
  domain 없으면 favicon 제외, 셀프호스팅 경로 1순위). (depends T008)

**Checkpoint**: 세 스토리 모두 독립 동작. 증권사 미지정·에셋 부재도 폴백 보장(SC-005).

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 품질 게이트와 일관성 최종 확인.

- [X] T011 [P] 변경 파일 `npx tsc --noEmit` · `npx eslint` 클린(헌장 품질 게이트)
- [ ] T012 `run`/`verify` 스킬로 quickstart 시나리오 육안 검증 — 자산배분(종목 로고·현금 폴백),
  거래 내역(종목/비종목 분기·유형 라벨 유지), 계좌(로고/favicon/이니셜 폴백·깨짐 0건). SC-001~005.
- [ ] T013 [P] (선택) favicon 품질이 낮은 증권사는 `public/brokers/{id}.svg` 직접 배치(1순위로 자동 승격)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 의존 없음 — 즉시 시작.
- **Foundational (Phase 2)**: T002 → T003. US3의 선행. US1/US2는 비의존(공개 API 사용).
- **User Stories (Phase 3~5)**: US1은 Setup 후 바로 가능(Foundational 불요 — MVP). US3은 T003 완료 후.
- **Polish (Phase 6)**: 원하는 스토리 완료 후.

### User Story Dependencies

- **US1 (P1)**: 독립. Foundational에 의존하지 않음(MVP로 단독 출시 가능).
- **US2 (P2)**: 독립. `Avatar` 공개 API만 사용.
- **US3 (P2)**: 폴백 프리미티브 `LogoImage`(T002) 필요. 내부적으로 T007→T008→T009 순.

### Within Each User Story

- US1: T004 ∥ T005(서로 다른 파일).
- US3: T007 → T008 → T009, T010은 T008 후.

### Parallel Opportunities

- T001 ∥ T002(서로 다른 영역).
- T004 ∥ T005 (US1, 다른 파일).
- 스토리 간 병렬: US1·US2는 동시 진행 가능. US3은 T003 이후 합류.
- T007 ∥ (US1/US2 작업) — 다른 파일.

---

## Parallel Example: User Story 1

```bash
# US1 두 페이지는 서로 다른 파일이라 동시 수정 가능:
Task: "src/app/allocation/stock/page.tsx 에 symbol 실어 SymbolAvatar 전달"
Task: "src/app/allocation/sleeve/[type]/page.tsx 에 symbol 실어 SymbolAvatar 전달"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup(T001).
2. **US1(T004,T005)** 바로 구현 — Foundational 없이도 동작(SymbolAvatar 공개 API).
3. **STOP & VALIDATE**: `/allocation/stock`·`/sleeve/[type]`에서 로고·현금 폴백 확인.
4. 준비되면 배포/데모.

### Incremental Delivery

1. (선택) Foundational(T002,T003)로 폴백 프리미티브 단일화 — US3 준비 + Avatar 일관성.
2. US1 → 독립 검증 → 데모(MVP).
3. US2 → 독립 검증 → 데모.
4. US3 → 독립 검증 → 데모.
5. Polish(T011~T013)로 품질 게이트·육안 검증 마무리.

---

## Notes

- [P] = 다른 파일·비의존. [Story] 라벨로 추적성 유지.
- DB·계산 엔진 변경 없음 — 회귀 위험은 표시 레이어 한정.
- 모든 surface는 동일 폴백 보장(FR-004) — 깨진 이미지 절대 노출 금지.
- 증권사 로고는 라이선스상 favicon 폴백 우선, 필요 시 셀프호스팅 SVG로 승격(T013).
- 작업/논리 단위마다 커밋. 체크포인트에서 스토리 단독 검증.
