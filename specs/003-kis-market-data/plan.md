# Implementation Plan: 한국투자증권(KIS) 시세·검색 데이터 소스 연동

**Branch**: `003-kis-market-data` | **Date**: 2026-06-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-kis-market-data/spec.md`

## Summary

야후에 묶인 시세·검색·환율 seam을 `FINANCE_SOURCE` 플래그(`yahoo|kis`)로 소스 교체 가능하게 만들고 **KIS를 1차 소스**로 붙인다. 기존 인터페이스(`searchSymbols`/`fetchQuotes`/`getPrices`/`getFxToKrw`)·라우트(`/api/search`·`/api/quote`)·반환 shape·DB·UI는 **불변**, 내부 구현만 추가한다. 검색은 KIS **종목마스터 다운로드→로컬 인덱싱**으로 한글검색을 해결하고, 환율은 해외 `price-detail.t_rate`에서 얻는다. 펀더멘털·배당·미국 ETF/지수는 범위 밖(야후/DART/EDGAR/KRX 유지).

## Technical Context

**Language/Version**: TypeScript, Next.js(App Router, 이 repo 변형 — `node_modules/next/dist/docs/` 가이드 우선)
**Primary Dependencies**: 기존 Supabase·Tailwind. 신규 외부 의존 없음(KIS는 fetch). 마스터 파일 unzip 필요(국내 .mst.zip / 해외 .cod.zip)
**Storage**: Supabase Postgres — 신규 테이블 `kis_security_master`(검색 인덱스). 토큰은 모듈 메모리 캐시
**Testing**: 단위테스트(`*.test.ts`, 기존 패턴) — `kis/normalize.ts` 순수함수 fixture 검증
**Target Platform**: 서버(Next.js 서버 라우트/서버 컴포넌트). KIS 호출은 서버 전용
**Project Type**: web (단일 Next.js 앱)
**Performance Goals**: 시세는 기존 `revalidate` 캐시로 호출 억제. KIS 레이트리밋 실전 20req/s 내. 토큰 1회/분 → 캐시 재사용
**Constraints**: KIS 자격증명 서버 전용(클라 비노출). 해외 무료 15분 지연 허용(본인/베타). 시장데이터는 실전 도메인
**Scale/Scope**: 시세·검색·환율·과거시세 4개 함수군 + 토큰클라이언트 + 마스터 동기화. 본인/소수 사용

## Constitution Check

*GATE: Phase 0 전 통과, Phase 1 후 재확인.*

| 원칙 | 평가 |
|---|---|
| I. 스타일 중립 | 해당 없음(데이터 소스 교체, 점수·보상 무관). ✅ |
| II. 정직한 게이미피케이션 | 공식 시세로 **정확도↑**. 가짜 숫자 없음. 해외 15분 지연은 가능 시 라벨로 표기 가능. ✅ |
| III. 엔진 정확·화면 단순 | 인터페이스·UI 불변, 내부만 교체 → "엔진 정확·화면 단순" 정합. ✅ |
| IV. 토스급 디자인 절제 | UI 변경 없음. ✅ |
| V. 단일 진실원천·정합 | `events` 무변경. 시세는 표시·계산 입력일 뿐 원장 아님. `securities`/신규 마스터는 표시용 캐시. ✅ |
| Additional: "시세·검색 인터페이스 뒤 야후(추후 교체)" | **헌법이 명시적으로 예상한 교체** — 본 기능이 그 구현. ✅ |
| Workflow 게이트 | tsc/eslint 클린, 계산성 변경엔 단위테스트, DB는 마이그레이션+타입 동기화 준수 예정. ✅ |

**위반 없음.** Complexity Tracking 불필요.

## Project Structure

### Documentation (this feature)
```text
specs/003-kis-market-data/
├── plan.md          # 본 파일
├── spec.md          # 완료
├── research.md      # 완료 (KIS 엔드포인트·검색·FX·레이트리밋)
├── data-model.md    # 완료
├── quickstart.md    # 완료
├── contracts/
│   └── internal-interfaces.md   # 완료 (불변 seam 계약)
└── tasks.md         # /speckit.tasks 단계에서 생성
```

### Source Code (repository root)
```text
src/lib/finance/
├── source.ts            # [신규] financeSource(): "yahoo"|"kis"
├── kis/
│   ├── client.ts        # [신규] kisToken() 캐시, kisFetch(path,{trId,params}) — 서버전용
│   ├── normalize.ts     # [신규] KIS JSON → PriceResult/SymbolSearchResult/FX (순수함수)
│   └── normalize.test.ts# [신규] fixture 단위테스트
├── prices.ts            # [수정] getPrices/getDailyKrwCloses 에 KIS 분기
├── fx.ts                # [수정] getFxToKrw 에 KIS(t_rate) 분기
├── kisMaster.ts         # [신규] 종목마스터 조회(검색용, kis_security_master)
└── (etfStats/dividends/companyProfile/indexStats/benchmark — 무변경, 야후 유지)

src/app/api/
├── search/route.ts      # [수정] FINANCE_SOURCE=kis 면 kis_security_master 검색
└── quote/route.ts       # [수정] (getKrwPrices 내부 분기로 대부분 흡수)

scripts/
└── syncKisMaster.ts     # [신규] 종목마스터 일1회 다운로드→kis_security_master upsert

supabase/migrations/
└── <ts>_kis_security_master.sql  # [신규] 검색 인덱스 테이블 + RLS(공용 read)
```

**Structure Decision**: 단일 Next.js 앱. 기존 `lib/finance` seam 패턴을 그대로 따라 `kis/` 서브모듈 + `source.ts` 플래그를 추가. KRX/etf 동기화 스크립트 패턴(`scripts/syncKrx*`)을 종목마스터 동기화에 재사용.

## Phase 진행
- Phase 0 (research.md): ✅ 완료 — 모든 NEEDS CLARIFICATION 해소.
- Phase 1 (data-model/contracts/quickstart + agent context): ✅ 문서 완료, agent context 갱신 예정.
- Phase 2 (tasks.md): `/speckit.tasks`에서 생성(본 plan 범위 밖).

## 주의/리스크
- 해외 EXCD(거래소) 매핑은 종목마스터 의존 → 마스터 동기화가 검색·해외시세 **둘 다**의 전제.
- `X`마켓 FX 차트 심볼코드 미확정 → 환율 spot은 `t_rate`로 회피, FX 시계열 필요 시 포털 코드표 확인.
- 토큰 1회/분 제한 → 캐시 필수(요청당 발급 금지).
