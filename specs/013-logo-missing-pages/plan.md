# Implementation Plan: 트랜잭션·자산배분 화면 종목 로고 적용

**Branch**: `013-logo-missing-pages` | **Date**: 2026-06-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/013-logo-missing-pages/spec.md`

## Summary

종목 로고가 보유·수익률 화면에는 뜨지만 **자산배분(allocation)·거래 내역(transactions)** 화면에는
안 뜨고, **계좌(accounts)** 는 증권사 이니셜+컬러 배지만 쓴다. 원인은 화면마다 다르지만(자산배분은
`symbol` 미전달, 거래 내역은 종목 로고 자리에 거래유형 아이콘만 표시, 계좌는 로고 미사용) 사용자
증상은 하나 — "로고 불일치". 명확화(Clarifications)에 따라 **새 표시 규칙을 발명하지 않고 기존 로고
파이프라인(`Avatar`/`assetImage`의 셀프호스팅→favicon→이니셜·색 폴백)을 그대로 재사용**한다.

기술 접근:
1. `Avatar`의 "순차 폴백 `<img>`" 로직을 작은 공용 프리미티브(`LogoImage`)로 추출(동작 보존) →
   증권사 배지도 같은 폴백 메커니즘을 재사용(원칙 V 단일 출처).
2. **자산배분**: 목록 아이템에 `symbol`을 실어 `SymbolAvatar symbol=…` 로 전달(현금 행은 미전달→폴백).
3. **거래 내역**: 종목 연결 거래(BUY/SELL/DIVIDEND)는 선두 아이콘을 종목 `Avatar`로, 비종목 거래
   (DEPOSIT/WITHDRAWAL/EXCHANGE)는 기존 유형 IconChip 유지. 거래유형은 기존 텍스트 라벨로 계속 구분.
4. **계좌**: `Broker` 설정에 `domain` 추가 → `BrokerChip`이 셀프호스팅 로고→도메인 favicon→이니셜·색
   순으로 폴백(`LogoImage` 재사용).

DB 변경 없음. 신규 외부 의존 없음(favicon은 운용사/ETF 로고에 이미 사용 중).

## Technical Context

**Language/Version**: TypeScript, Next.js(App Router, 이 repo 변형 — `node_modules/next/dist/docs/` 우선)  
**Primary Dependencies**: 기존 Supabase·Tailwind. 신규 의존 없음. 로고는 셀프호스팅(public/) + Google s2 favicon(기존 사용)  
**Storage**: 변경 없음. 증권사 `domain`은 `src/lib/config/brokers.ts` 코드 상수(단일 출처, DB 아님)  
**Testing**: 순수 함수 단위테스트(`*.test.ts`) — `assetImage.test.ts` 패턴. 증권사 로고 후보 산출 함수에 테스트 추가  
**Target Platform**: 모바일 단일·라이트 단일 웹앱  
**Project Type**: web application (Next.js single app)  
**Performance Goals**: 추가 네트워크/렌더 부담 없음 — 기존 아바타와 동일 후보·캐시 경로. 로고 로드 실패는 폴백으로 무중단  
**Constraints**: 깨진 이미지·빈 아이콘 0건(항상 폴백). 화면 간 같은 종목 로고 불일치 0건. 토스급 절제(원칙 IV) 유지  
**Scale/Scope**: 수정 surface 4곳 — 공용 프리미티브 1, 자산배분 2페이지, 거래 내역 리스트 1, 계좌 칩 1 + 증권사 설정

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 원칙 | 평가 |
|---|---|
| I. 스타일 중립 | ✅ 무관 — 시각 표현만, 점수·보상 미변경 |
| II. 정직한 게이미피케이션 | ✅ 무관 — 사실(보유 종목/증권사)에 대응하는 로고만 표시, 가짜 숫자 없음 |
| III. 엔진 정확·화면 단순 | ✅ 계산 엔진 무변경. UI는 엔진 결과(symbol)를 표시만. 화면 더 명료해짐 |
| IV. 토스급 절제 | ✅ 기존 아바타와 동일 톤. 등락색·과한 애니메이션 미추가. 로고는 무채색 카드 위 원형 마크 일관 |
| V. 단일 출처·정합 | ✅ 폴백 로직을 `LogoImage`로 단일화(중복 제거). `events`/계산 원장 무변경. 증권사 domain은 brokers.ts 단일 출처 |

**Gate: PASS** — 위반 없음. Complexity Tracking 불필요.

## Project Structure

### Documentation (this feature)

```text
specs/013-logo-missing-pages/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (UI 컴포넌트 계약)
│   └── ui-contracts.md
└── tasks.md             # /speckit.tasks 출력(이 명령에서 생성 안 함)
```

### Source Code (repository root)

```text
src/
├── components/
│   ├── ui/
│   │   ├── Avatar.tsx              # [수정] LogoImage 재사용으로 리팩터(동작 보존)
│   │   └── LogoImage.tsx           # [신규] 순차 폴백 <img> 공용 프리미티브
│   ├── accounts/
│   │   └── BrokerSelect.tsx        # [수정] BrokerChip: 로고→favicon→이니셜·색 폴백
│   └── transactions/
│       └── ActivityList.tsx        # [수정] 종목 연결 거래는 종목 Avatar 선두 표시
├── app/
│   └── allocation/
│       ├── stock/page.tsx          # [수정] item.symbol 실어 SymbolAvatar에 전달
│       └── sleeve/[type]/page.tsx  # [수정] 동일
└── lib/
    ├── config/brokers.ts           # [수정] Broker.domain 추가 + 로고 후보 헬퍼
    └── finance/brokerImage.ts      # [신규(선택)] 증권사 로고 후보 산출(순수 함수) + 테스트

public/
└── brokers/                        # [선택] 셀프호스팅 증권사 로고(있으면 1순위, 없으면 favicon)
```

**Structure Decision**: 기존 Next.js 단일 앱 구조 유지. 신규 디렉터리/패키지 없음. 핵심은 폴백
로직 단일화(`LogoImage`)와 각 화면이 그 경로를 타도록 데이터(symbol/domain)를 연결하는 것.

## Complexity Tracking

> Constitution Check 위반 없음 — 작성 불필요.
