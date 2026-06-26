# Implementation Plan: 거장 13F 자동 파이프

**Branch**: `018-13f-auto-pipeline` | **Date**: 2026-06-27 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/018-13f-auto-pipeline/spec.md`

## Summary

SEC EDGAR 공개 API에서 분기별 13F-HR를 자동 수집·파싱하여 DB에 저장하고, 기존 LegendExplorer UI를 정적 하드코딩에서 DB 기반으로 전환한다. CUSIP→티커 매핑은 OpenFIGI API(배치·캐시), 스케줄링은 Vercel Cron + TypeScript 동기 스크립트 이중 트리거.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router — `node_modules/next/dist/docs/` 우선)  
**Primary Dependencies**: Supabase JS, SEC EDGAR API(공개), OpenFIGI API(공개·무료)  
**Storage**: Supabase PostgreSQL — 신규 테이블 4개 (`legend_registry`, `legend_13f_snapshots`, `legend_13f_holdings`, `cusip_ticker_cache`)  
**Testing**: `*.test.ts` 단위테스트 — 변화 분류 함수(`classifyChange`) 중심  
**Target Platform**: Next.js 웹앱 (모바일 단일, 라이트 모드)  
**Project Type**: Web application (Next.js App Router 변형)  
**Performance Goals**: SC-001 — 13F 공개 후 48시간 이내 반영. SC-003 — 페이지 로딩 현재 대비 동등 이상  
**Constraints**: 신규 외부 의존 최소(OpenFIGI 1개). XML 파서 추가 또는 regex 파싱 선택  
**Scale/Scope**: 거장 3–5명, 분기별 종목 7–500개, 연 4회 수집

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 원칙 | 판정 | 근거 |
|------|------|------|
| I. 스타일 중립 | ✅ PASS | 거장 정보는 점수·보상 없는 참고 데이터 |
| II. 정직한 게임화 | ✅ PASS | FR-008: 취득가 없음 → XIRR 비교 미제공 명시 |
| III. 엔진 정확·화면 단순 | ✅ PASS | SEC 공식 데이터 원천, UI는 기존 LegendExplorer 확장 |
| IV. 토스급 디자인 절제 | ✅ PASS | 신규 UI 없음, 기존 탭·도넛·배지 패턴 유지 |
| V. 단일 진실원천 | ✅ PASS | 13F는 events 테이블과 독립된 외부 참고 데이터, 이중 계상 없음 |

**Constitution Check**: ALL PASS — 구현 진행 가능.

## Project Structure

### Documentation (this feature)

```text
specs/018-13f-auto-pipeline/
├── plan.md              ← 이 파일
├── research.md          ← Phase 0 완료
├── data-model.md        ← Phase 1 완료
├── quickstart.md        ← Phase 1 완료
├── contracts/
│   └── sync-pipeline.md ← Phase 1 완료
└── tasks.md             ← /speckit-tasks 가 생성
```

### Source Code (repository root)

```text
scripts/
└── sync13fHoldings.ts        # 신규 — 수동/cron 동기 스크립트

src/
├── app/
│   └── api/
│       └── cron/
│           └── sync-13f/
│               └── route.ts  # 신규 — Vercel Cron 엔드포인트
├── lib/
│   └── finance/
│       ├── legends.ts        # 수정 — DB 기반 조회 함수 추가, 인터페이스 확장
│       └── edgar.ts          # 수정 — fetch13fLatest() 추가
└── components/
    └── benchmark/
        └── LegendExplorer.tsx # 수정 — DB props 수용, 기준일·변화 표시

supabase/
└── migrations/
    └── YYYYMMDDHHMMSS_legend_13f_pipeline.sql  # 신규 마이그레이션

vercel.json                   # 수정 — crons 블록 추가
```

**Structure Decision**: 단일 Next.js 프로젝트. 동기 스크립트는 `scripts/`(기존 KRX 패턴), Vercel Cron은 `src/app/api/cron/`, DB는 `supabase/migrations/`.

## Complexity Tracking

> Constitution Check 위반 없음 — 이 섹션 해당 없음.
