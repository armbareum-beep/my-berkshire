# Phase 0 Research: 계좌 카드 UI 개선

NEEDS CLARIFICATION 없음(순수 표시 변경, 기존 데이터 재사용). 아래는 설계 결정과 코드 근거.

## R1. 금액 오버플로 원인

- **Decision**: flexbox 제약을 표준 패턴으로 적용 — 가변(이름/분류) 영역에 `min-w-0 flex-1 truncate`, 고정(금액) 영역에 `shrink-0 whitespace-nowrap`.
- **Rationale**: accounts 페이지(AccountRow.tsx:108) 금액 wrapper에 `shrink-0`/`whitespace-nowrap`가 없고, 가운데 텍스트에 `flex-1`이 없어 긴 금액(`₩12,345,678,900`)이 줄어들지도 줄바꿈되지도 않고 카드를 밀어낸다. 홈(AccountGroups.tsx:57)은 가운데 컨테이너에 `min-w-0`조차 없다. `min-w-0`이 없으면 flex 자식이 콘텐츠보다 작아지지 못해 truncate가 작동하지 않는 것이 근본 원인.
- **Alternatives considered**: 금액 폰트 축소/`text-xs` — 큰 금액에서도 미봉책이고 톤이 깨짐, 기각. 금액을 둘째 줄로 내리기 — accounts 행 디자인(한 줄 요약)과 불일치, 기각.

## R2. 위저드 계좌 선택 UI

- **Decision**: 공용 `wizard/AccountPicker.tsx` 1개를 신설해 BuyWizard·TxnWizard 양쪽에서 재사용. 세로 리스트 카드. 각 카드 = `BrokerChip`(미지정 시 `Avatar`) + 이름 + `ACCOUNT_TYPE_LABEL` 배지.
- **Rationale**: 두 위저드가 동일한 알약 블록을 중복 보유(BuyWizard.tsx:231–246, TxnWizard.tsx:285–304). 컴포넌트로 추출하면 FR-001/002를 한 곳에서 충족하고 일관성(SC-003) 보장. accounts 행과 같은 표시 컴포넌트(`BrokerChip`@BrokerSelect.tsx, `Avatar`, `ACCOUNT_TYPE_LABEL`@tax.ts)를 그대로 재사용해 신규 디자인 자산 0.
- **Alternatives considered**: 위저드별 인라인 카드 — 중복·드리프트 위험, 기각. 알약 유지 + 분류만 텍스트 추가 — 사용자 명시적으로 카드식 요청, 기각.

## R3. 위저드에 분류·로고 데이터 공급

- **Decision**: `AccountOption`(TransactionFlow.tsx:17) 타입에 `broker: string | null` 추가, transactions/page.tsx의 accounts select·매핑에 `broker` 추가. `accountType`은 이미 `AccountOption`에 존재.
- **Rationale**: `accounts` 테이블에 `broker` 컬럼이 이미 있음(lib/accounts.ts:58에서 select 중). 위저드 페이지 쿼리만 한 컬럼 추가하면 로고 표시 가능. 스키마 변경 없음 → 원칙 V(데이터 정합) 위반 없음.
- **Alternatives considered**: 로고 생략(이름+분류만) — 사용자 "로고+이름+분류" 선택, 기각.

## R4. 홈 보유 계좌 분류

- **Decision**: AccountGroups.tsx에서 `ACCOUNT_TYPE_LABEL[g.accountType]`를 "자회사 N개" 앞에 표시. lib 변경 불필요.
- **Rationale**: **확인 완료** — `AccountGroup`은 이미 `accountType`(lib/accounts.ts:26)·`broker`(:30)를 로드·노출. 컴포넌트에서 import + 렌더만 추가하면 됨. accounts 페이지와 동일 표기로 SC-003 충족.
- **Alternatives considered**: 없음(데이터 이미 존재).
