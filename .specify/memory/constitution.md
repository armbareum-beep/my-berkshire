<!--
Sync Impact Report
- Version change: 1.0.0 → 1.1.0 (MINOR — Additional Constraints의 모드 정의 개정)
- Amendment 2026-06-23 (007-family-ledger-growth): 챌린지·라이브 모드 제거, 단일 ledger(가족 장부)로 수렴.
  근거: 수기 장부 위 경쟁 랭킹은 조작 가능 → 원칙 II(정직)와 충돌. 검증 데이터(증권사 연동)는 비대상.
- Ratification: initial adoption 2026-06-22
- Principles defined (unchanged):
  I. 스타일 중립 (Style-Neutral Scoring)
  II. 정직한 게이미피케이션 (Honest Gamification)
  III. 엔진 정확·화면 단순 (Accurate Engine, Simple Surface)
  IV. 토스급 디자인 절제 (Toss-Grade Restraint)
  V. 단일 진실원천·데이터 정합 (Single Source of Truth & Reconciliation)
- Added sections: Additional Constraints (stack & data invariants); Development Workflow & Quality Gates; Governance
- Templates checked:
  ✅ .specify/templates/plan-template.md — generic "Constitution Check" gate, no edit needed
  ✅ .specify/templates/spec-template.md — scope/requirements format compatible
  ✅ .specify/templates/tasks-template.md — task categories compatible
- Deferred TODOs: none
-->

# my-berkshire Constitution

버크셔식 지주회사 메타포로 가족의 투자를 운영·기록하는 앱(기능통화 KRW, 단일 장부 모드). 아래 원칙은 협상 불가이며, 모든 spec·plan·구현은 이를 통과해야 한다.

## Core Principles

### I. 스타일 중립 (Style-Neutral Scoring)
점수·미터·보상은 사용자의 **매매 스타일(가치/성장 등)을 재단하지 않는다**. 보편 규율(저비용·저레버리지·계획성·기록 완성도)만 평가한다. 거래 빈도·회전율을 보상하는 어떤 장치도 금지(과회전 유도 금지). 성장투자자도 동등한 고객이다.
*근거:* 스타일 편향은 사용자를 쫓아내고 제품을 한 진영의 도구로 축소시킨다.

### II. 정직한 게이미피케이션 (Honest Gamification)
모든 게임 요소는 **사실에 근거**해야 한다. 미터·진행도는 "사용자가 입력/실천한 양"을 뜻하지 성과를 뜻하지 않는다. 가짜 숫자(예: 잠긴 지표 자리의 임의 값) 금지. 빈 상태("미입력")는 중립 톤이며 죄책감을 유발하지 않는다. 앱은 사용자가 선언하지 않은 목표(예: 설립일)를 임의로 만들지 않는다. 시세·평가 기반 축하는 시장 결과가 아니라 사용자의 행동/시간을 축하할 때만 한다.
*근거:* 금융 앱의 신뢰는 정직에서 나온다. 한 번의 과장이 전체 수치 신뢰를 깬다.

### III. 엔진 정확·화면 단순 (Accurate Engine, Simple Surface)
계산 엔진(XIRR·투시·펀더멘털·자산배분·수익률)은 **명세 기반으로 정확**해야 하며, UI는 그 깊이를 단순하게 담는다. 복잡함은 점진적 공개로 숨긴다("사업부 신설" 등 성장 보상으로 노출). 한 화면은 한 가지를 명확히 한다. UI는 계산을 직접 판단하지 않고 엔진 결과(상태)만 표시한다.
*근거:* 정확성은 타협 불가, 그러나 사용자는 복잡성이 아니라 명료함을 본다.

### IV. 토스급 디자인 절제 (Toss-Grade Restraint)
화면은 거의 무채색 + 흰 카드가 그림자로 떠 있는 톤. 브랜드색·솔리드 색면은 화면당 핵심 1개로 제한. 등락색(빨강/파랑)은 **시세 등락에만**, 경고는 앰버. 면적 그라데이션·과한 애니메이션 금지. `docs/mockups/*`가 디자인 기준선이다.
*근거:* "토스 옆에 둬도 같은 급"이 도그푸딩·획득 채널 전략의 전제다.

### V. 단일 진실원천·데이터 정합 (Single Source of Truth & Reconciliation)
`events` 테이블이 유일한 거래 원장이다. 같은 포지션을 두 경로로 기록해 **이중 계상**하지 않는다(예: 온보딩 스냅샷 ↔ 실제 역사 백필은 교체·정합, 추가 아님). 불변식: 한 종목의 활성 이벤트 순수량 = 현재 보유 수량. `founded_at`은 가장 이른 기록을 따른다(뒤로만 이동). 외화는 기능통화 KRW로 환산해 저장한다.
*근거:* 자산·수익률의 신뢰는 정합된 단일 원장에서만 나온다.

## Additional Constraints (Stack & Data Invariants)

- **스택:** Next.js(이 repo의 변형 — `node_modules/next/dist/docs/` 가이드 우선 확인), TypeScript, Supabase(Postgres + RLS), Tailwind. 모바일 단일·라이트 단일(다크모드 비대상).
- **단일 회사:** 사용자당 지주회사(holding)는 1개로 고정. 추가 생성·전환·삭제 없음(가족 장부).
- **계좌 레이어:** 지주회사 → 계좌 → 자회사 3층. 현금·보유는 계좌 단위 회계, 현금은 통화별 풀.
- **모드:** 단일 `ledger`(소급 입력 자유·수기 평단·import). 챌린지·라이브(경쟁/검증 랭킹) 모드는 폐지 — 수기 데이터 랭킹은 조작 가능하므로(원칙 II). `holding_mode` enum/컬럼은 잔존하나 항상 'ledger'.
- **시세·검색:** 인터페이스 뒤 야후(추후 토스 교체). 한글 검색 한계 인지.
- **RLS:** 모든 서버 접근은 사용자 소유 holding/계좌로 스코프. 서버 액션은 ownership 검증.

## Development Workflow & Quality Gates

- **Spec Kit 흐름:** 기능은 `/speckit-specify → (clarify) → plan → tasks → implement`로 진행. spec=무엇·왜, plan=어떻게, tasks=실행.
- **품질 게이트:** 변경 파일은 `npx tsc --noEmit`·`npx eslint` 클린. 계산 변경엔 단위테스트(`*.test.ts`). DB 변경은 `supabase/migrations/`로, 타입은 재생성/동기화.
- **검증:** 핵심 변경은 실제 앱 구동/스크린샷으로 확인(`run`/`verify` 스킬). 기능 회귀(렌더·계산 불변) 확인.
- **마이그레이션 순서:** 제약 변경은 그 값을 쓰는 코드보다 먼저 배포.

## Governance

이 헌장은 다른 관행에 우선한다. 개정은 (a) 변경 사유와 영향 문서화, (b) 버전 범프(MAJOR=원칙 제거/재정의, MINOR=원칙·섹션 추가, PATCH=문구 정정), (c) 의존 템플릿(plan/spec/tasks) 동기화를 요구한다. 모든 spec/plan은 "Constitution Check"에서 위 원칙 위반이 없는지 확인하며, 위반은 명시적 정당화 또는 설계 변경으로만 통과한다.

**Version**: 1.1.0 | **Ratified**: 2026-06-22 | **Last Amended**: 2026-06-23
