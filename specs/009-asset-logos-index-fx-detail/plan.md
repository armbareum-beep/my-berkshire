# Implementation Plan: 종목 로고 이미지 · 지수 지표 표시 · 환율 상세

**Branch**: `009-asset-logos-index-fx-detail` | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-asset-logos-index-fx-detail/spec.md`

## Summary

세 가지 묶음 기능. 모두 **표시(read-only) 계층** 변경이며 원장(`events`)·계산 엔진을 건드리지 않는다.

1. **종목 로고 (P1)** — 기존 `Avatar` + `brandColor`(텍스트 폴백) + `Flag`(국기 SVG) + `PRESET_QUOTES`(지수/크립토 분류)를 그대로 활용해, 자산을 4유형(기업/운용사/지수·국가/암호화폐)으로 분류하고 유형별 이미지를 고르는 단일 순수 함수 `assetImage()`를 신설. 이미지가 없으면 기존 글자 동그라미 폴백. 신규 외부 유료 의존 없음(기업=favicon, 운용사=운용사 favicon, 지수=로컬 국기 SVG, 코인=로컬 코인 SVG).
2. **지수 상세 지표 (P2)** — Forward PER 셀 제거(타입·페치 포함). KOSPI 지표가 비는 **진짜 원인은 `krx_index_stats_cache` 미충전**(수동 Playwright 싱크)이므로 캐시 상태 검증→충전을 절차로 포함하고, 한국 지수에서 KRX 캐시가 없을 때 "—"가 아니라 "데이터 준비 중"으로 구분 표기.
3. **환율 상세 (P3)** — `/index/[symbol]` 패턴을 미러링한 `/fx/[code]` 신규 페이지. 현재 환율은 `getFxToKrw`, 추이는 `getDailyKrwCloses(["{CCY}KRW=X"])`로 기존 `PriceChart` 재사용. 진입은 현금 탭 `?tab=fx` 통화 행에 링크.

## Technical Context

**Language/Version**: TypeScript 5, React 19 / Next.js(이 repo 변형 — App Router, RSC; `node_modules/next/dist/docs/` 가이드 우선)
**Primary Dependencies**: 기존 스택만 — Supabase(Postgres+RLS), Tailwind. 시세·환율=야후 fetch(기존), 로고=Google favicon(기존)+로컬 SVG. **신규 외부/유료 의존 없음**
**Storage**: 기존 `krx_index_stats_cache`(지수 PER/PBR/배당). 신규 테이블 없음. 로고는 코드 맵 + `public/` 정적 SVG
**Testing**: 변경 파일 `npx tsc --noEmit` · `npx eslint` 클린. 순수 함수(`assetImage`, 지수 지표 상태)는 `*.test.ts` 단위테스트. 실제 구동/스크린샷(`run`/`verify`)으로 회귀 확인
**Target Platform**: 모바일 단일·라이트 단일 웹(다크모드 비대상)
**Project Type**: web (단일 Next.js 앱, `src/` 단일 프로젝트)
**Performance Goals**: 상세 진입 체감 즉시(<3s, SC-005). 로고는 작은 정적/favicon 이미지로 LCP 영향 미미. 이미지 실패 시 즉시 폴백(레이아웃 시프트 0)
**Constraints**: 깨진 이미지 0건(항상 폴백). 없는 데이터 생성 금지(Forward PE·미싱 지표는 표기로만). RLS·원장 불변 유지
**Scale/Scope**: 영향 화면 — 아바타 사용처 8 페이지 + ~10 컴포넌트, 지수 상세 1, 신규 환율 상세 1. 지원 통화 USD·JPY·EUR

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 원칙 | 평가 | 결과 |
|------|------|------|
| **I. 스타일 중립** | 점수·보상 변경 없음(표시 전용). | ✅ 해당 없음 |
| **II. 정직한 게이미피케이션** | Forward PE 등 출처 없는 값을 **만들지 않고 제거/"정보 없음"** 표기 → 원칙과 정면 부합. 빈 상태는 중립 톤("데이터 준비 중"). | ✅ 강한 부합 |
| **III. 엔진 정확·화면 단순** | UI는 엔진/캐시 결과(상태)만 표시. 지수 지표는 셀 단위 상태(값/정보없음/준비중)로 단순화. 로고는 한 함수로 결정. | ✅ |
| **IV. 토스급 절제** | 로고=브랜드색 원형(목업 기준선, [[mockup-design-reference]]와 일치). 라이트·모바일 단일 유지. 면적색 추가·과애니메이션 없음. | ✅ |
| **V. 단일 진실원천·정합** | `events` 원장·보유 수량 불변. FX·로고·지수 지표 모두 read-only. | ✅ |

**Additional Constraints**: 신규 외부 의존 없음(favicon·야후·로컬 SVG는 기존 범주) · DB 스키마 변경 없음 · RLS 영향 없음(공개 시세/캐시). → **위반 없음, 게이트 통과.**

## Project Structure

### Documentation (this feature)

```text
specs/009-asset-logos-index-fx-detail/
├── plan.md              # (this file)
├── research.md          # Phase 0 — 4유형 이미지 출처·KRX 캐시 원인·FX 시계열 결정
├── data-model.md        # Phase 1 — AssetImage / IndexMetricCell / FxDetail 표시 모델
├── quickstart.md        # Phase 1 — 검증 시나리오(대표 4유형·KOSPI·USD 상세)
├── contracts/
│   ├── asset-image.md   # assetImage() 입력/출력 계약 + Avatar 렌더 규칙
│   ├── index-metrics.md # 지수 지표 셀 상태 계약(Forward PER 제거)
│   └── fx-detail.md     # /fx/[code] 라우트·표시 계약
└── checklists/requirements.md
```

### Source Code (repository root)

```text
src/
├── lib/finance/
│   ├── assetImage.ts          # [신규] 자산 유형 분류 + 유형별 이미지 URL 결정(순수 함수)
│   ├── assetImage.test.ts     # [신규] 분류·폴백 단위테스트
│   ├── brandColor.ts          # [재사용] 텍스트 폴백 색/레이블 — 운용사 맵 출처로도 활용
│   ├── indexStats.ts          # [수정] forwardPE 제거, 한국 지수 KRX-미싱 상태 노출
│   ├── quotes.ts              # [재사용] PRESET_QUOTES — 지수/환율 분류·FX 라우트 검증
│   ├── currencies.ts          # [재사용] CURRENCIES/currencyMeta — FX 상세 메타
│   ├── fx.ts                  # [재사용] getFxToKrw — 현재 환율
│   └── prices.ts              # [재사용] getDailyKrwCloses("{CCY}KRW=X") — 추이
├── components/
│   ├── ui/Avatar.tsx          # [수정] logoUrl → assetImage 사용, 폴백 동일
│   ├── ui/Flag.tsx            # [재사용] 국기 SVG 렌더(지수·FX)
│   ├── index/IndexValuation.tsx # [수정] Forward PER 셀 제거, 셀 상태 표기
│   └── fx/FxDetailContent.tsx  # [신규] 환율 상세 본문(헤더·차트·고저·변동)
├── app/
│   ├── fx/[code]/page.tsx     # [신규] /fx/[code] 페이지(크롬: BackButton+BottomTabBar)
│   ├── @sheet/(.)fx/[code]/page.tsx # [신규·선택] 바텀시트 변형(기존 패턴 일치 시)
│   └── cash/page.tsx          # [수정] 환율 탭 통화 행 → /fx/[code] 링크
public/
└── coins/                     # [신규] btc.svg, eth.svg 등 로컬 코인 아이콘(국기와 동일 방식)
```

**Structure Decision**: 기존 단일 Next.js 앱(`src/`) 구조를 그대로 따른다. 신규 디렉터리는 라우트(`app/fx/[code]`), 컴포넌트(`components/fx`), 정적 자산(`public/coins`)뿐. 로고 로직은 `lib/finance/assetImage.ts` 한 곳에 모아 모든 아바타 사용처가 자동으로 일관(FR-004)되게 한다.

## Phase 0 — Research

`research.md` 참조. 핵심 결정:
- **로고 출처(유형별)**: 기업=favicon(도메인 맵 확장), 운용사=운용사 favicon 도메인 맵, 지수=로컬 국기 SVG(`public/flags`), 코인=로컬 코인 SVG(`public/coins`). 미보유는 텍스트 폴백.
- **지수 PER 미표시 원인**: 1차=KRX 캐시 미충전(수동 싱크), 2차=`indexStats.ts:162` forwardPE 비대칭 폴백. → Forward PER 제거 + 캐시 충전 검증 + 한국 지수 KRX-미싱 시 "준비 중" 표기.
- **FX 시계열**: 신규 API 불요. `getDailyKrwCloses(["{CCY}KRW=X"])`가 환율값 시계열을 그대로 반환(USDKRW=X 통화=KRW → ×1).

## Phase 1 — Design & Contracts

- **data-model.md**: `AssetImage`(유형·source·url), `IndexMetricCell`(label·value·status), `FxDetail`(pair·rate·changeAbs·changePct·high52·low52·series) 표시 모델.
- **contracts/**: `assetImage()` 입출력·Avatar 렌더 규칙 / 지수 지표 셀 상태 계약(Forward PER 제거) / `/fx/[code]` 라우트·표시 계약.
- **quickstart.md**: 대표 4유형 로고, KOSPI 지표, USD 환율 상세 검증 절차.
- **Agent context**: `.specify/scripts/bash/update-agent-context.sh claude` 실행.

## Complexity Tracking

> Constitution Check 위반 없음 — 비움.
