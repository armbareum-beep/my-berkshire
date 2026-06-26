# Implementation Plan: 컴퍼니(CEO별) 레이어 — 가족 계좌를 CEO별로 분리

**Branch**: `015-account-members` | **Date**: 2026-06-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/015-account-members/spec.md`

## Summary

지주회사와 계좌 사이에 **컴퍼니(CEO)** 레이어를 삽입한다:
`버크셔 그룹(지주회사) → 컴퍼니(CEO) → 계좌 → 자회사(종목)`.
신규 `members` 테이블 + `accounts.member_id` FK로 계좌를 사람별로 묶고, 기존 수익률
엔진(`computeReturn`)을 컴퍼니 계좌 범위로 좁혀 **컴퍼니별 수익률**을 산출한다. 회사
페이지의 **포함/제외 토글**(`members.included`)이 연결 재무(`getPortfolio`)의 이벤트
필터 한 곳에 작용해 홈·순자산·XIRR 전반이 자동 재계산된다. 기존 계좌는 기본 컴퍼니
'본인'에 자동 귀속하여 무중단 마이그레이션. v1은 **주식 계좌**에 한정(수기자산·부채·현금
분리·분사는 제외).

## Technical Context

**Language/Version**: TypeScript 5.x, React Server Components (Next.js — 이 repo 변형, `node_modules/next/dist/docs/` 가이드 우선)
**Primary Dependencies**: Supabase JS, Tailwind. 신규 외부 의존 없음.
**Storage**: Supabase Postgres + RLS. 신규 테이블 `members`, 기존 `accounts`에 `member_id` 컬럼.
**Testing**: 계산 변경 단위테스트(`*.test.ts`, 기존 `src/lib/finance/*.test.ts` 패턴), `npx tsc --noEmit`·`npx eslint` 게이트.
**Target Platform**: 모바일 단일·라이트 단일 웹(다크모드 비대상).
**Project Type**: 웹앱(Next.js App Router, RSC + 서버 액션).
**Performance Goals**: 추가 쿼리 최소화 — 기존 `loadAccountGroups`·`getPortfolio` 데이터 재사용, 컴퍼니 그룹핑은 메모리 가공.
**Constraints**: 기존 회귀 0(컴퍼니 1개면 화면 동일). 평가액 합 정합(컴퍼니 합 = 그룹 합).
**Scale/Scope**: 가족당 컴퍼니 1~6명 수준. 변경/신규 파일 ~12개, 마이그레이션 1개.

## Constitution Check

*GATE: Phase 0 전 통과, Phase 1 후 재확인.*

| 원칙 | 평가 |
|---|---|
| I. 스타일 중립 | ✅ 컴퍼니별 수익률은 **정보 표시**일 뿐, 스타일 재단·회전 보상 없음. ⚠️ 가족 간 **경쟁 랭킹/점수화 금지**(007 가족장부 개정 정신) — CEO 실적은 순위·승패 없이 중립 표기. |
| II. 정직 | ✅ 컴퍼니별·토글 숫자는 모두 해당 계좌의 실제 `events`에서 산출(가짜값 없음). 빈 컴퍼니는 "보유 없음" 중립 표기. |
| III. 엔진 정확·화면 단순 | ✅ 기존 `computeReturn` 재사용(새 수익률 정의 없음). 컴퍼니 1개면 층 숨김 = 점진적 공개. |
| IV. 디자인 절제 | ✅ 컴퍼니 칩/아바타(이름 글자·이모지 폴백), 등락색만 사용. 신규 색면 없음. `docs/mockups/*` 톤 준수. |
| V. 단일 진실원천 | ✅ `events`는 유일 원장 유지. 컴퍼니는 **그룹핑 메타**일 뿐 이중 계상 없음. SC-004(합 정합) 보장. |

**헌장 제약 충돌(개정 필요)**: Additional Constraints의 *"계좌 레이어: 지주회사 → 계좌
→ 자회사 3층"* 이 본 기능으로 **4층**(컴퍼니 삽입)이 된다. → 헌장 MINOR 개정 필요(아래
Complexity Tracking). "단일 회사 고정"은 **유지**(컴퍼니는 holding 내부 하위 묶음이며 회사
추가/전환 아님).

## Project Structure

### Documentation (this feature)

```text
specs/015-account-members/
├── plan.md              # 이 파일
├── research.md          # Phase 0 — 토글 필터·트리거·마이그레이션 결정
├── data-model.md        # Phase 1 — members 엔티티·accounts 변경·RLS
├── quickstart.md        # Phase 1 — 적용·검증 절차
├── contracts/           # Phase 1 — 서버 액션·집계 함수 인터페이스
│   ├── server-actions.md
│   └── aggregation.md
└── tasks.md             # /speckit.tasks 출력(이 명령에서 생성 안 함)
```

### Source Code (repository root)

```text
supabase/migrations/
└── <ts>_account_members.sql          # 신규: members 테이블·accounts.member_id·RLS·트리거·백필

src/lib/
├── supabase/database.types.ts        # 변경: members + accounts.member_id 타입
├── members.ts                        # 신규: Member/MemberGroup, loadMemberGroups, 컴퍼니별 result
├── accounts.ts                       # 변경: AccountGroup에 memberId 노출
└── portfolio.ts                      # 변경: getPortfolio 이벤트를 included 컴퍼니로 필터

src/app/
├── company/
│   ├── page.tsx                      # 변경: 컴퍼니 관리 섹션 + CEO 실적 + 토글
│   └── actions.ts                    # 변경/신규: 컴퍼니 CRUD·토글 서버 액션
└── accounts/
    └── actions.ts                    # 변경: create/updateAccount 에 memberId 인자

src/components/
├── company/
│   ├── MemberManager.tsx             # 신규: 컴퍼니 추가 폼
│   └── MemberRow.tsx                 # 신규: 컴퍼니 행 + CEO 실적 + 포함 토글
├── accounts/
│   ├── AccountManager.tsx            # 변경: 컴퍼니 선택 드롭다운
│   └── AccountRow.tsx                # 변경: 컴퍼니 선택·표시
├── structure/HoldingStructureTree.tsx# 변경: 컴퍼니 층 삽입(4단)
└── dashboard/AccountGroups.tsx       # 변경(최소): 계좌 summary에 컴퍼니 칩
```

**Structure Decision**: 기존 Next.js App Router 단일 웹앱 구조를 그대로 사용. 신규 도메인
로직은 `src/lib/members.ts` 한 파일에 모으고, 나머지는 기존 `accounts`/`company` 경로와
컴포넌트 패턴을 확장한다. 별도 패키지/서비스 분리 없음(원칙 III·IV 단순성).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 계좌 레이어 3층 → 4층 (헌장 Additional Constraints 개정) | 사용자 핵심 요구: 계좌를 주인(아빠/엄마/아이)별로 분리. 단일 holding 안에서 사람 단위 회계·표시가 불가능한 현 3층의 한계. | (a) account_type/broker로 구분 → 사람이 아니라 세금/증권사 축이라 의미 불일치. (b) holding을 사람마다 → "단일 회사 고정" 원칙 위반·가족 합산 불가. → 중간 컴퍼니 층이 최소 침습. |

> 조치: `/speckit.implement` 전(또는 직후) 헌장 §Additional Constraints "계좌 레이어"를
> "지주회사 → 컴퍼니(CEO) → 계좌 → 자회사 4층(컴퍼니 1개면 생략 가능)"으로 MINOR 개정.
> 단일 회사 고정·계좌 단위 회계·통화별 현금풀 불변.
