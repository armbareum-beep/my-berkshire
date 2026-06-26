# Implementation Plan: 토스식 계좌 만들기 — 종류 피커 + CTA 진입

**Branch**: `017-account-create-picker` | **Date**: 2026-06-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/017-account-create-picker/spec.md`

## Summary

계좌 종류 선택을 *설명 없는 알약 토글* → *아이콘 + 이름 + 한 줄 절세 설명* 카드 피커로 바꾸고(US1),
어카운트 페이지에서 계좌 추가 폼을 항상 펼쳐두지 않고 "계좌 만들기" CTA를 눌러야 나타나게 한다(US2).
저장 데이터·계산·DB 스키마는 불변 — **표시 UI와 진입 방식만** 변경한다. 기존 `createAccount` 액션,
`EmojiIcon`(이모지→lucide), `tax.ts` 종류 정의를 그대로 재사용한다.

## Technical Context

**Language/Version**: TypeScript, Next.js(App Router — 이 repo 변형, `node_modules/next/dist/docs/` 가이드 우선)
**Primary Dependencies**: React(클라이언트 컴포넌트), Tailwind, `lucide-react`(EmojiIcon 경유), `sonner`(toast). 신규 외부 의존 없음.
**Storage**: Supabase Postgres — **스키마 변경 없음**. 종류 설명·아이콘은 코드 상수(`tax.ts`)로만 추가.
**Testing**: `npx tsc --noEmit` + `npx eslint` 클린. 계산 변경 없음 → 단위테스트 불필요(선택: 모든 AccountType이 설명·아이콘을 갖는지 정적 검증 1건). 실제 앱 구동 검증(`run`/`verify`).
**Target Platform**: 모바일 웹, 라이트 단일(다크 비대상).
**Project Type**: 웹앱(Next.js App Router 변형) — `src/app` + `src/components`.
**Performance Goals**: N/A(정적 표시 UI, 신규 네트워크 호출 없음).
**Constraints**: 토스급 디자인 절제(원칙 IV) — 무채색+흰 카드, 브랜드색은 선택 표시 1곳으로 제한. 표시 전용(저장·계산 불변).
**Scale/Scope**: 계좌 종류 5종, 어카운트 페이지 1개, 신규 컴포넌트 2개(피커 + CTA 디스클로저), 상수 2개.

## Constitution Check

*GATE: Phase 0 전 통과, Phase 1 후 재확인.*

- **I. 스타일 중립**: 점수·보상 요소 없음 → 해당 없음. ✅
- **II. 정직한 게이미피케이션**: 카드 설명은 임의 숫자가 아니라 `tax.ts`의 실제 세제 규칙에서 도출(FR-003). 잠긴 자리 가짜값 없음. ✅
- **III. 엔진 정확·화면 단순**: 엔진 무변경(표시 전용). 폼을 CTA 뒤로 숨겨 화면을 더 단순화(점진적 공개). ✅
- **IV. 토스급 디자인 절제**: 카드 피커는 흰 카드 + 회색 텍스트, 아이콘은 lucide 라인(EmojiIcon), 선택 강조만 브랜드색 1곳. 면적 색·과한 애니메이션 없음. `docs/mockups/*` 톤 준수. ✅
- **V. 단일 진실원천**: `events`·`accounts` 스키마/기록 경로 불변. 이중 계상 없음. ✅
- **Additional Constraints**: 단일 회사·4층 계좌 레이어 영향 없음(주인 컴퍼니 select 보존). `createAccount` 액션 시그니처·RLS 불변. Next 변형 가이드 우선 확인 의무 명시. ✅

**판정: 위반 없음.** Complexity Tracking 불필요.

## Project Structure

### Documentation (this feature)

```text
specs/017-account-create-picker/
├── plan.md              # 이 파일
├── research.md          # Phase 0 — 진입 방식(인라인 디스클로저 vs 시트) 결정, 문구·아이콘 매핑
├── data-model.md        # Phase 1 — 표시 상수(설명·아이콘) 정의, 스키마 불변 명시
├── contracts/
│   └── ui-contracts.md  # Phase 1 — 컴포넌트 props·디스클로저 동작 계약
├── quickstart.md        # Phase 1 — 수동 검증 절차
├── checklists/
│   └── requirements.md  # /speckit.specify 산출(통과)
└── tasks.md             # /speckit.tasks 산출(이 명령에서 생성 안 함)
```

### Source Code (repository root)

```text
src/
├── app/accounts/
│   ├── page.tsx                         # [수정] 하단 <AccountManager/> 직접 렌더 → <CreateAccountSection/>로 교체
│   └── actions.ts                       # [불변] createAccount 시그니처 그대로 재사용
├── components/accounts/
│   ├── AccountManager.tsx               # [수정] 알약 토글(라인 63-79) → <AccountTypePicker/>로 교체. onAdded 콜백 추가
│   ├── AccountTypePicker.tsx            # [신규] 아이콘+이름+절세설명 카드 목록 + 선택 표시
│   ├── CreateAccountSection.tsx         # [신규] "계좌 만들기" CTA ↔ 폼 디스클로저(open 상태)
│   └── BrokerSelect.tsx                 # [불변] 폼 안에서 재사용
├── components/ui/
│   ├── EmojiIcon.tsx                    # [불변] 이모지→lucide 매핑 재사용(필요 아이콘 모두 존재)
│   └── StockRow.tsx                     # [참조] 아이콘+2줄+우측 슬롯 행 패턴 차용
└── lib/config/tax.ts                    # [수정] ACCOUNT_TYPE_DESCRIPTION, ACCOUNT_TYPE_EMOJI 상수 추가
```

**Structure Decision**: 기존 단일 웹앱 구조(`src/app` 라우트 + `src/components` 공유 컴포넌트)를 따른다.
신규 파일은 2개 컴포넌트뿐이며, 진입 게이팅은 새 라우트 없이 클라이언트 디스클로저로 처리한다(아래 research 결정).

## Complexity Tracking

> Constitution Check 위반 없음 — 비움.
