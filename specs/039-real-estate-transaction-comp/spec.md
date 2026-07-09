# Feature Specification: 부동산 거래사례비교법(국토부 실거래가) 평가

**Feature Branch**: `claude/real-estate-transaction-pricing-uotldj`
**Created**: 2026-07-09
**Status**: In Review

## 배경 (Why)

`023-real-estate-income-cap`까지 부동산 평가는 직접 입력(`direct`)과 수익률환원법(`cap_rate`) 두 가지였다. 수익형 부동산은 환원법이 맞지만, **아파트·빌라·오피스텔·분양권은 국토교통부 실거래가가 공개**되므로 **거래사례비교법(Sales Comparison Approach)**이 더 객관적이다:

```
평가액 = 동일 단지 · 유사 전용면적(±10%) 의 가장 최근 실거래 1건
```

- 데이터 소스: 공공데이터포털(data.go.kr) 국토부 실거래가 매매 API 4종 (사용자 활용신청 승인 완료)
- 갱신: 매월 5일 cron 자동 + 상세 화면 "시세 갱신" 버튼 수동
- 최근 6개월 무거래 시 마지막 평가액 유지(정직한 폴백 — 낡은 기준일이 그대로 보임)

## 사용자 결정사항

| 항목 | 결정 |
|---|---|
| 평가액 산정 | 동일 단지 + 전용면적 ±10% 중 **최근 실거래 1건** |
| 갱신 방식 | **월 1회 cron + 수동 버튼** (조회 시점 fetch 아님 — 영속화) |
| 대상 유형 | 아파트(APT) · 연립다세대(RH) · 오피스텔(OFFI) · 분양권(SILV) |
| API 키 | `DATA_GO_KR_API_KEY` env (Decoding 키, 코드/커밋에 미포함) |

## 핵심 설계: 평가방법별 currentValue 영속성

| 방법 | current_value 의미 | 갱신 주체 |
|---|---|---|
| `direct` | 영속(사용자 입력) | 사용자 수정 |
| `cap_rate` | 무시 — 읽기 시 `applyCapRateValuation`이 파생값으로 덮어씀 | 항상 최신(파생) |
| `transaction_comp` | **영속(API가 쓴 값)** | cron 월 1회 + 수동 버튼 |

`applyCapRateValuation()`은 `cap_rate`가 아닌 자산을 그대로 통과시키므로 **읽기 경로(대시보드·순자산·랭킹) 코드는 무수정** — `transaction_comp` 평가액이 `direct`와 동일 경로로 합산된다.

## 구현 요약

### DB 마이그레이션

`supabase/migrations/20260709010000_manual_assets_transaction_comp.sql`:
- `valuation_method` check 에 `'transaction_comp'` 추가
- RTMS 매칭키 4컬럼: `rtms_lawd_cd`(법정동 5자리), `rtms_property_type`(APT|RH|OFFI|SILV), `rtms_complex_name`(단지명 원문), `rtms_exclusive_area`(전용면적 ㎡)

### RTMS 라이브러리 (`src/lib/finance/rtms/`)

- **`parse.ts`** — 4개 API 공용 XML 파서(정규식, 의존성 0). `dealAmount`(만원·콤마)→₩, 날짜 zero-pad, **해제거래(cdealType/cdealDay) 제외**, 오류 resultCode throw. 단지명 태그 폴백 `aptNm ?? mhouseNm ?? offiNm`.
- **`match.ts`** — 정규화(공백 제거·소문자) **완전일치** + 면적 ±10%(경계 포함). 퍼지 매칭은 오매칭 위험으로 의도적 미도입.
- **`client.ts`** — 엔드포인트 4종(`apis.data.go.kr/1613000/RTMSDataSvc{AptTrade,RHTrade,OffiTrade,SilvTrade}`), serviceKey `encodeURIComponent`, 페이지 루프(1000행×최대 5), fetch `revalidate: 21600`.
- **`refresh.ts`** — `findLatestComparableDeal()`: 당월부터 6개월 역순 조회, 첫 매칭 월의 최신 1건(신고 지연 30일 흡수). `loadMonth` 주입(테스트 스텁·cron 메모캐시).
- **`lawdCodes.ts`** — 전국 시군구 253개 정적 상수. 출처: 행정표준코드 법정동코드 + 2023-05 이후 개편 보정(강원 42→51, 전북 45→52, 군위군 대구 편입, 부천시 구 재설치, 세종). 구가 있는 시는 구 단위 코드만(RTMS 관례).

### 등록 플로우 (UI)

`ManualAssetForm`: 부동산 계열 kind(`REAL_ESTATE`·`COMMERCIAL`)에서 평가방법 3버튼(직접 입력/수익률환원법/실거래가). 실거래가 선택 시 `RtmsDealPicker` 렌더:

1. 시/도 → 시/군/구 select → 유형 4토글(아파트/연립·빌라/오피스텔/분양권)
2. 단지명 검색(300ms 디바운스 + AbortController) → `GET /api/rtms/deals?lawdCd&type&q` (로그인 필수, 최근 3개월)
3. 거래 탭 선택 → 요약 카드로 접힘 + `currentValue`(거래가)/`valuedAt`(거래일)/`valuationSource`("국토부 실거래가") 자동 채움
4. 평가손실 확인 토스트(FR-006)는 실거래가 방식에서 생략(시장가이므로)

### 갱신 경로

- **수동**: `refreshTransactionCompValuation(assetId)` (`src/app/real-estate/actions.ts`) — RLS 로 소유권 보장, **좁은 UPDATE**(current_value·valued_at·valuation_source만). `ManualAssetsSection` 펼침 영역의 "시세 갱신" 버튼.
- **자동**: `/api/cron/refresh-rtms-valuations` (매월 5일 KST 06:00, `vercel.json`) — sync-kis-master 계약(Bearer CRON_SECRET, 실패도 200). service role 로 미매도·미삭제 `transaction_comp` 자산 순회, (유형:지역:월) 메모캐시로 쿼터 절약, 개별 실패 skip. 응답: `{ok, total, updated, noDeal, failed}`.

### 방식 전환

`networth/actions.ts`의 insert/update 는 method 가 `transaction_comp`가 아니면 rtms 4컬럼을 null 초기화(잔재 제거). 분양권 → 준공 후 아파트 전환은 수정 폼에서 유형만 재선택.

## 테스트

- `rtms/parse.test.ts` — 금액·날짜 정규화, mhouseNm/offiNm 폴백, 해제거래 제외, 오류 throw
- `rtms/match.test.ts` — 정규화 일치, ±10% 경계, 최신 1건 선택
- `rtms/refresh.test.ts` — 역순 조회·조기 종료, 6개월 무거래 null, 연 경계

## 운영 체크리스트

1. Vercel env: `DATA_GO_KR_API_KEY` (Decoding 키) — 로컬은 `.env.local`
2. 마이그레이션 적용: `npx supabase link --project-ref cfzairdystqguatvcggc && npx supabase db push` (**사용자 확인 후**, holdings 테이블 존재 검증)
3. cron 검증: `curl -H "Authorization: Bearer $CRON_SECRET" /api/cron/refresh-rtms-valuations`
