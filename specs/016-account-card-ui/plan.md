# Implementation Plan: 계좌 카드 UI 개선

**Branch**: `016-account-card-ui` | **Date**: 2026-06-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/016-account-card-ui/spec.md`

## Summary

세 화면의 계좌 표시를 정리한다: (1) accounts 페이지 카드의 금액 오버플로를 flexbox 제약(`min-w-0`/`flex-1`/`shrink-0`)으로 수정, (2) 모든 거래 위저드(매수 + 비-매수)의 계좌 선택을 알약식 → 공용 카드 컴포넌트(로고+이름+분류 배지, 세로 리스트)로 교체, (3) 홈 보유 계좌에 분류 라벨 추가 + 동일한 오버플로 방지. 신규 DB·계산 없음, 순수 표시 변경 + 두 군데 데이터 프롭 확장(`AccountOption.broker`, `AccountGroup.accountType`).

## Technical Context

**Language/Version**: TypeScript, Next.js (이 repo 변형 — `node_modules/next/dist/docs/` 우선)  
**Primary Dependencies**: 기존 Supabase·Tailwind. 신규 외부 의존 없음  
**Storage**: Supabase Postgres — 스키마 변경 없음(`accounts.broker`·`accounts.account_type` 기존 컬럼 노출만)  
**Testing**: 수동 구동 검증(`run`/`verify`), 변경 파일 `tsc --noEmit`·`eslint` 클린  
**Target Platform**: 모바일 단일·라이트 단일 웹앱  
**Project Type**: Web application (Next.js App Router, `src/` 단일 트리)  
**Performance Goals**: N/A (정적 렌더, 추가 네트워크 없음)  
**Constraints**: 모바일 최소 폭에서 금액 비오버플로. 기존 등락색·디자인 톤 유지(원칙 IV)  
**Scale/Scope**: 화면 3개, 컴포넌트 ~4개 파일 + 1 신규 파일

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. 스타일 중립** — ✅ 점수·보상과 무관한 표시 변경.
- **II. 정직한 게이미피케이션** — ✅ 임의 숫자 없음. 기존 계좌 속성만 노출.
- **III. 엔진 정확·화면 단순** — ✅ 엔진 불변. UI는 엔진/데이터 결과만 표시. 분류 노출로 화면 명료성↑.
- **IV. 토스급 디자인 절제** — ✅ accounts 페이지와 동일 톤(흰 카드·그림자), 신규 색면 없음. `docs/mockups/*` 기준선 유지.
- **V. 단일 진실원천·데이터 정합** — ✅ `events`·계좌 회계 불변. 표시만 추가, 이중 계상 없음.

**결과: 위반 없음. Complexity Tracking 불필요.**

## Project Structure

### Documentation (this feature)

```text
specs/016-account-card-ui/
├── plan.md              # This file
├── spec.md              # Feature spec
├── research.md          # Phase 0 — 오버플로 원인·재사용 컴포넌트 결정
├── data-model.md        # Phase 1 — 프롭/타입 확장(신규 DB 없음)
├── quickstart.md        # Phase 1 — 수동 검증 절차
└── checklists/
    └── requirements.md  # spec 품질 체크리스트(완료)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── accounts/ ─ AccountRow 사용처(변경 없음, 카드 컴포넌트만 수정)
│   └── transactions/page.tsx          # accounts 쿼리에 broker 추가, AccountOption 매핑 확장
├── components/
│   ├── accounts/
│   │   ├── AccountRow.tsx              # [변경] 오버플로 수정(min-w-0/flex-1/shrink-0/truncate)
│   │   └── BrokerSelect.tsx            # [재사용] BrokerChip
│   ├── dashboard/
│   │   └── AccountGroups.tsx           # [변경] 분류 라벨 + 오버플로 수정
│   ├── transactions/
│   │   ├── TransactionFlow.tsx         # [변경] AccountOption 타입에 broker 추가
│   │   └── wizard/
│   │       ├── AccountPicker.tsx       # [신규] 공용 카드식 계좌 선택
│   │       ├── BuyWizard.tsx           # [변경] 알약 → <AccountPicker>
│   │       └── TxnWizard.tsx           # [변경] 알약 → <AccountPicker> (부수효과 유지)
│   └── ui/Avatar.tsx                   # [재사용] 폴백 아바타
└── lib/
    ├── config/tax.ts                   # [재사용] ACCOUNT_TYPE_LABEL
    ├── format.ts                       # [재사용] money()
    └── accounts.ts                     # AccountGroup 타입에 accountType 유무 확인(없으면 추가)
```

**Structure Decision**: 기존 `src/` 단일 트리(Next.js App Router). 신규 파일은 위저드 전용 공용 컴포넌트 1개(`wizard/AccountPicker.tsx`)뿐. 나머지는 기존 컴포넌트의 표시 로직 수정.

## 구현 단계 (Phase별 매핑 — US 우선순위 따름)

### P1 — 거래 위저드 카드식 계좌 선택 (User Story 1)
1. **타입·데이터 확장**
   - `AccountOption`(TransactionFlow.tsx 17–22행)에 `broker: string | null` 추가.
   - transactions/page.tsx select(66행)에 `broker` 추가, 매핑(69–74행)에 `broker: a.broker ?? null` 추가.
2. **공용 컴포넌트** `wizard/AccountPicker.tsx` 신규: props `{accounts, selectedId, onSelect}`. 세로 리스트 `flex flex-col gap-2`, 각 항목 `<button>` — 좌측 `BrokerChip`(미지정 시 `Avatar size="lg"`), 가운데 `flex min-w-0 flex-1 flex-col`(이름 `font-bold truncate` + `ACCOUNT_TYPE_LABEL[accountType]` 배지), 선택 시 `ring-2 ring-primary`.
3. **교체**: BuyWizard.tsx(231–246행)·TxnWizard.tsx(285–304행)의 알약 `<div>`를 `<AccountPicker .../>`로. TxnWizard는 `onSelect`에서 기존 `setAccountId(a.id); setPicked(null); setQty("")` 부수효과 유지.

### P2 — accounts 페이지 오버플로 (User Story 2)
4. AccountRow.tsx 보기 모드(88–116행): 가운데 컨테이너(99행)에 `flex-1`, 이름 span(100행)에 `truncate`, 금액 wrapper(108행)에 `shrink-0 whitespace-nowrap` 추가.

### P3 — 홈 보유 계좌 (User Story 3)
5. AccountGroups.tsx summary(45–82행): 가운데 컨테이너(57행)에 `min-w-0 flex-1`, 이름(58행)에 `truncate`, 금액 wrapper(63행)에 `shrink-0`; 분류줄(59–61행)을 `{ACCOUNT_TYPE_LABEL[g.accountType]} · 자회사 {g.holdings.length}개`로. **확인 완료: `AccountGroup`은 이미 `accountType`·`broker` 필드를 가짐(lib/accounts.ts:26,30) → lib 변경 불필요, `ACCOUNT_TYPE_LABEL` import만 추가.**

## Complexity Tracking

> Constitution Check 위반 없음 — 해당 없음.
