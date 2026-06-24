# Implementation Plan: 단일 가족 장부 전환 + 성장 허브

**Branch**: `007-family-ledger-growth` | **Date**: 2026-06-23 | **Spec**: [spec.md](./spec.md)

## Summary

챌린지/랭킹·라이브 모드를 제거하고 앱을 단일 지주회사 가족 장부로 단순화하며, 비워진 탭에 "성장 허브"(`/growth`)를 둔다. 성장 허브는 대부분 *기존 엔진/홈 카드의 재배치*이며, 신규 로직은 납입 원금 기준 `companyTier` 순수함수 하나뿐.

## Technical Context

**Language/Version**: TypeScript, Next.js(이 repo 변형 — `node_modules/next/dist/docs/` 가이드 우선)
**Storage**: Supabase Postgres + RLS. 신규 마이그레이션 1개(랭킹 제거 + challenge→ledger 이관).
**Testing**: `npx tsc --noEmit`, `npx eslint`. 계산 변경 시 `*.test.ts`(여기선 `companyTier` 권장).
**Target Platform**: 모바일 단일·라이트 단일 웹앱.
**Project Type**: 단일 Next.js App Router 프로젝트(`src/`).
**Constraints**: 헌법 II(정직)·III(엔진 정확·화면 단순)·IV(토스 절제) 준수. 신규 외부 의존 0.

## Constitution Check

*GATE: 통과 — 핵심 원칙 I~V 위반 없음. 한 가지 개정 필요.*

- **원칙 I (스타일 중립)**: ✅ 성장 등급은 납입 규모·시간, 규율 점수는 저비용·저레버리지·계획. 회전율/스타일 보상 없음.
- **원칙 II (정직한 게이미피케이션)**: ✅ **강화**. 조작 가능한 수익률 랭킹 제거. 기업 등급은 평가액(시장 결과)이 아니라 납입 원금 기준. 빈 상태는 중립 톤.
- **원칙 III (엔진 정확·화면 단순)**: ✅ 성장 허브는 엔진 결과만 표시하는 뷰. 홈은 가벼워짐(계기판/세계관 분리).
- **원칙 IV (토스 절제)**: ✅ 기존 카드 컨벤션(`rounded-2xl bg-card shadow-card`)·색 토큰 재사용. confetti 없음.
- **원칙 V (단일 원장)**: ✅ `events` 원장 불변. 마이그레이션은 mode 컬럼 값만 이관(원장 미변경).
- **개정 필요**: 헌법 "Additional Constraints"의 모드 정의(`ledger`/`challenge`/`live`)가 현실과 어긋남 → `ledger` 단일로 개정, 버전 MINOR 범프(1.0.0 → 1.1.0). FR-012.

위반 없음 → Complexity Tracking 비움.

## Project Structure

### Source Code

```text
src/
├── app/
│   ├── growth/page.tsx            # 신규 — 성장 허브
│   ├── leaderboard/               # 삭제
│   ├── returns/page.tsx           # 수정 — 스냅샷 저장 제거(벤치마크 유지)
│   ├── onboarding/{page,actions,OnboardingRail}.tsx  # 수정 — 모드 선택 제거
│   ├── company/{page,actions}.tsx # 수정 — 단일 회사로 축소
│   └── dashboard/page.tsx         # 수정 — style·report 카드 제거(성장으로 이전), 모드 라벨 제거
├── components/
│   ├── dashboard/BottomTabBar.tsx # 수정 — 챌린지→성장
│   ├── returns/PercentileCard.tsx # 삭제
│   ├── company/{DeleteCompanyButton,CompanyStructures}.tsx  # 삭제
│   └── growth/*                   # 신규(필요 시) — 성장 카드 컴포넌트
├── lib/
│   ├── finance/companyTier.ts     # 신규 — 납입 원금 기준 등급
│   └── perf/snapshot.ts           # 삭제
supabase/migrations/<ts>_remove_challenge.sql  # 신규
.specify/memory/constitution.md     # 개정(MINOR)
```

**Structure Decision**: 기존 App Router 구조 유지. 성장 페이지는 `dashboard/page.tsx`의 서버컴포넌트+Suspense 패턴을 미러.

## Phase 0 — Research (요약, 별도 research.md 생략)

- 랭킹은 `user_perf_snapshots`(mode='challenge', alpha not null) 집계 → prod에 challenge 스냅샷 0건이라 비어 있었음(근본 원인 확인 완료).
- 성장 허브 빌딩블록 전부 존재: `computeStyle`/`StyleCard`(규율), `journeyMilestones`(마일스톤), `ReportLinkStreamed`/`reportStreak`(리포트·스트릭), `computeCelebrations`(축하), `computeDashboard.invested`(납입 원금). → 신규는 `companyTier`만.
- mode "ledger" 경로 = 가족 장부 동작(소급·수기·import). challenge/live 분기는 ledger로 수렴 시 inert.

## Phase 1 — Design

- **companyTier(investedKrw): { tierIndex, label, lo, nextLo|null, progress }** — 구간 상수 배열 기반. 평가액 아님(invested). 테스트 `companyTier.test.ts`.
- **성장 페이지 데이터 흐름**: `getPortfolio` → `computeDashboard`(invested) → companyTier; `computeStyle`(부채·계획 준수) → StyleCard; `journeyMilestones`; `ReportLink`/`reportStreak`. 홈에서 쓰던 streamed 컴포넌트 로직 이전.
- **마이그레이션**: `update holdings set mode='ledger' where mode<>'ledger';` + 알파/XIRR RPC 6개 drop + `drop table user_perf_snapshots`. enum/컬럼 유지.

자세한 워크스트림·파일·검증은 루트 플랜 `C:\Users\armba\.claude\plans\quiet-kindling-lampson.md`와 [tasks.md](./tasks.md) 참조.

## Complexity Tracking

위반 없음 — 비움.
