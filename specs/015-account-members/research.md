# Phase 0 Research: 컴퍼니(CEO) 레이어

스펙에 [NEEDS CLARIFICATION]는 없다(사전 대화에서 해소). 본 문서는 구현상 결정해야 할
기술 선택지를 정리한다.

## R1. 합산 토글의 적용 지점 (가장 침습적)

**Decision**: `src/lib/portfolio.ts`의 `getPortfolio` 한 곳에서 이벤트를 **포함된 컴퍼니의
계좌**로 필터한다. 구현: 이벤트 select에 `accounts.member_id`를 포함시키고, `members`에서
`included=true` id 집합을 조회한 뒤 JS에서 필터(`member_id === null`은 기본 컴퍼니이므로
포함 취급). 필터된 이벤트로 기존 `computeReturn` 호출.

**Rationale**: `getPortfolio`는 React `cache`로 대시보드·순자산·XIRR·자산배분 등 거의 모든
연결 지표의 단일 입력원이다. 여기 한 곳만 필터하면 전 화면이 자동으로 토글을 반영한다
(원칙 III·V: 단일 원천, 화면 단순). 각 소비처를 개별 수정할 필요 없음.

**Alternatives considered**:
- PostgREST 중첩 필터(`accounts.members.included`)로 DB에서 거르기 → 임베디드 리소스
  필터의 inner-join 제약·가독성 저하. JS 필터가 명확하고 `member_id IS NULL` 처리도 쉬움.
- 각 화면(대시보드/순자산)에서 개별 제외 → 누락·불일치 위험, 단일 원천 위배.

**주의**: 수기자산(`manual_assets`)·부채(`liabilities`)는 holding 레벨이라 토글과 무관하게
남는다(FR-011). 순자산 화면에서 "주식 기준 제외"임을 문구로 드러낸다.

## R2. 컴퍼니별 수익률 계산

**Decision**: 신규 `src/lib/members.ts`에서 컴퍼니마다 그 계좌의 이벤트만 모아 **기존
`computeReturn(snapshot, events, prices, today, available)`** 을 재호출한다. 평가액·보유는
기존 `loadAccountGroups` 결과를 `member_id`로 그룹핑해 재사용(가격 재조회 없음).

**Rationale**: 새로운 수익률 정의를 만들지 않는다(원칙 III). 회사 전체와 동일 엔진·동일
`founded_at` 스냅샷을 쓰되 입력 이벤트 범위만 좁힌다. SC-004(컴퍼니 평가액 합 = 그룹 합)
자연 충족.

**Alternatives considered**: 컴퍼니별 별도 XIRR 정의/지분 안분 → 과복잡, 정직성 위험.

**열린 질문(구현 시 확정)**: 컴퍼니별 `founded_at`을 그룹 설립일로 통일할지, 그 컴퍼니
최초 이벤트일로 할지. 기본은 **그룹 설립일 통일**(단순·일관). data-model의 가정에 기록.

## R3. 마이그레이션 / 기본 컴퍼니 보장

**Decision**:
1. `members` 테이블 생성(+RLS 4종, accounts 정책과 동일 패턴).
2. `accounts.member_id uuid references members(id) on delete set null` 추가(+인덱스).
3. **백필**: holding마다 '본인' 컴퍼니 1개 생성 후 그 holding의 모든 계좌 `member_id` 연결.
4. **트리거 교체**: 기존 `create_default_account()`(holding insert 후 'main' 계좌 생성)를
   '본인' 컴퍼니 생성 → 그 `member_id`로 'main' 계좌 생성하도록 갱신.

**Rationale**: FR-003/004 무중단. `on delete set null`로 컴퍼니 삭제 시 계좌가 미지정(기본
컴퍼니 취급)으로 안전하게 떨어짐(데이터 손실 0, Edge Case 충족). 마이그레이션이 그 값을
쓰는 코드보다 먼저 배포(헌장 워크플로우).

**Alternatives considered**: `member_id NOT NULL` + 기본행 강제 → 삭제·미지정 처리 경직.
nullable + "null=기본 컴퍼니" 규칙이 유연.

## R4. 토글 상태 저장 위치

**Decision**: `members.included boolean not null default true` 컬럼에 영속(서버 액션으로
갱신, `revalidatePath`). 쿠키/세션 아님.

**Rationale**: FR-009 "설정이 저장되어 유지". 서버 컴포넌트가 직접 읽어 SSR에 반영 가능,
디바이스 간 일관.

**Alternatives considered**: 쿠키 임시 필터 → 영속 요구 위반, RSC에서 매번 동기화 부담.

## R5. 컴퍼니 1개일 때 단순함 유지 (점진적 공개)

**Decision**: 컴퍼니가 1개면 트리·자산 화면에서 컴퍼니 층을 렌더하지 않고 기존과 동일하게
계좌→종목만 보인다. 계좌 생성/수정의 컴퍼니 선택 UI도 1개면 숨김. 컴퍼니 관리·추가는
회사 페이지에서 노출.

**Rationale**: 원칙 III·IV, SC-002(추가 단계 0). 복잡함은 "컴퍼니 신설"이라는 성장 동작으로
사용자가 원할 때만 드러난다(복잡성 게이미피케이션 철학).

## R6. 명칭/메타포

**Decision**: 레이어=**컴퍼니**, 사람=**CEO**(예: "민준 컴퍼니 · CEO 민준"). 그룹 루트는
기존 "지주회사/버크셔 그룹". 자회사(종목) 라벨은 유지.

**Rationale**: 메모리 `family-member-view`의 '회장+컴퍼니 CEO' 작명과 정렬. 사용자가
"구성원"·"주주" 거부(주주=단독 소유/단일 뷰 뉘앙스). 미래 분사·CEO 로그인뷰로 자연 확장.
