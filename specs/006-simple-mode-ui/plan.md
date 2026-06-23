# Implementation Plan: 간편모드 UI 업그레이드 (브랜드 마크 + 행 진입 어포던스)

**Branch**: `006-simple-mode-ui` | **Date**: 2026-06-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-simple-mode-ui/spec.md`

## Summary

대시보드 홈 헤더 좌상단에 **ENUF 워드마크**(글자 로고, 심볼 없음)를 추가해 앱 정체성을 세우고, 보유종목 목록의 각 행 우측 끝에 **상세 진입 화살표(›)**를 붙여 시트 진입 어포던스를 명확히 한다. 데이터 모델·DB·시세 엔진 변경 없이 두 개의 표현 컴포넌트(`dashboard/page.tsx` 헤더, `AccountGroups`/`HoldingsBrowser` 행)만 수정한다. 기존 디자인 토큰과 005 상세 시트(@sheet 슬롯)를 그대로 재사용한다.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19 / Next.js(App Router, 이 repo 변형)
**Primary Dependencies**: Tailwind CSS v4(@theme inline 토큰), 기존 컴포넌트(`SymbolAvatar`, `lib/format`). 신규 외부 의존 없음.
**Storage**: 변경 없음(읽기조차 신규 없음 — 기존 서버 데이터 그대로 표시)
**Testing**: 변경 파일 `npx tsc --noEmit` + `npx eslint` 클린. 시각/회귀는 `run`/`verify`로 실제 구동 확인(계산 로직 변경 없어 단위테스트 비대상).
**Target Platform**: 모바일 단일 레이아웃(max-w 480px), 라이트 단일
**Project Type**: 웹 앱(Next.js App Router) — 프론트엔드 단일
**Performance Goals**: 추가 렌더/요청 없음. 정적 마크업·아이콘 글리프만 추가(런타임 영향 무시 가능).
**Constraints**: 폭 360~480px에서 헤더·행 잘림/겹침 없음. 기존 평가금액·수익률 가독성·정렬·접이식 회귀 없음.
**Scale/Scope**: 화면 2종(대시보드 홈 헤더 1곳 + 보유 행 2개 렌더 경로). 수정 파일 ~3개.

## Constitution Check

*GATE: Phase 0 전 통과, Phase 1 후 재확인.*

| 원칙 | 평가 | 판정 |
|------|------|------|
| I. 스타일 중립 | 점수·미터·보상 무관(시각 표현만) | ✅ 해당 없음 |
| II. 정직한 게이미피케이션 | 가짜 숫자·임의 목표 도입 없음. 표시 데이터 불변 | ✅ 해당 없음 |
| III. 엔진 정확·화면 단순 | UI는 기존 엔진 결과만 표시. 화살표는 "한 화면 한 가지"의 진입 명료화에 부합 | ✅ 부합 |
| IV. 토스급 디자인 절제 | ⚠ **핵심 게이트**. 워드마크는 솔리드 색면/그라데이션 금지, 화면당 브랜드 색 1개 제한 준수. 워드마크는 잉크색(`--foreground`) 타이포로, 대시보드의 기존 primary(CTA·하단탭)와 색 충돌 없이. 화살표는 기존 `--muted-foreground` 글리프(계좌 summary `›`와 동일 패턴) | ✅ 설계로 충족 |
| V. 단일 진실원천 | 원장·계산 무관 | ✅ 해당 없음 |

**게이트 통과**: 위반 없음. 원칙 IV는 "워드마크=잉크 타이포(색면 아님), 화살표=muted 글리프"라는 설계 제약으로 충족한다(아래 research 참조). Complexity Tracking 불필요.

## Project Structure

### Documentation (this feature)

```text
specs/006-simple-mode-ui/
├── spec.md              # 완료 (/speckit-specify)
├── plan.md              # 이 파일
├── research.md          # Phase 0 — 워드마크 타이포·화살표 패턴 결정
├── data-model.md        # Phase 1 — 신규 엔티티 없음(명시)
├── quickstart.md        # Phase 1 — 변경·검증 절차
├── contracts/
│   └── ui-contract.md   # Phase 1 — 헤더/행의 시각·상호작용 계약
└── checklists/
    └── requirements.md  # 완료, 전 항목 통과
```

### Source Code (repository root)

```text
src/
├── app/
│   └── dashboard/
│       └── page.tsx                      # [수정] 헤더 좌상단 ENUF 워드마크 추가 (US1)
└── components/
    ├── dashboard/
    │   └── AccountGroups.tsx             # [수정] 계좌별 모드 보유 행 우측 화살표 (US2)
    └── holdings/
        └── HoldingsBrowser.tsx           # [수정] 전체 종목(flat) 모드 행 우측 화살표 (US2)
```

**Structure Decision**: 기존 Next.js App Router 단일 프론트엔드 구조를 그대로 사용한다. 신규 파일·디렉토리 없이 기존 표현 컴포넌트 3개만 국소 수정한다. 보유 행은 두 렌더 경로(계좌별=`AccountGroups`, 전체=`HoldingsBrowser` flat 분기)가 있으므로 화살표를 양쪽에 동일 패턴으로 적용해 일관성을 보장한다.

## Complexity Tracking

> Constitution Check 위반 없음 — 작성 불필요.
