# Phase 0 Research: KIS 시세·검색 연동

모든 NEEDS CLARIFICATION 해소. 출처: 공식 repo `koreainvestment/open-trading-api`, `python-kis`, KIS Developers 포털.

## R1. 인증/토큰
- **Decision**: `POST /oauth2/tokenP` (body `{grant_type:"client_credentials", appkey, appsecret}`) → `access_token`(24h). **토큰은 캐시·재사용**(발급 1회/분 제한). GET 시세호출은 `hashkey` 불필요(주문 POST만 필요).
- **Rationale**: 분당 1회 제한이라 요청마다 발급하면 즉시 막힘. 모듈 스코프 캐시 + 만료 60초 전 갱신. 검증 완료(HTTP 200, access_token).
- **Alternatives**: 요청마다 발급(거부 — 레이트리밋), DB 영속 캐시(과함 — 단일 서버 모듈캐시로 충분, 재시작 시 1회 재발급).

## R2. 국내 현재가
- **Decision**: `GET /uapi/domestic-stock/v1/quotations/inquire-price`, 헤더 `tr_id: FHKST01010100`. 쿼리 `FID_COND_MRKT_DIV_CODE=J`, `FID_INPUT_ISCD={6자리}`. 현재가 `output.stck_prpr`, 전일종가 `output.stck_sdpr`.

## R3. 해외(미국) 현재가
- **Decision**: `GET /uapi/overseas-price/v1/quotations/price`, `tr_id: HHDFS00000300`. 쿼리 `AUTH=""`, `EXCD={NAS|NYS|AMS}`, `SYMB={ticker}`. 현재가 `output.last`, 전일 `output.base`, 통화 USD.
- **주의**: 무료는 15분 지연. EXCD(거래소)는 종목마스터에서 매핑(아래 R6). 모르면 NAS→NYS→AMS 순 시도.

## R4. 과거 일봉
- **Decision 국내**: `GET /uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice`, `tr_id: FHKST03010100`. `FID_PERIOD_DIV_CODE=D`, `FID_INPUT_DATE_1/2`(YYYYMMDD), `FID_ORG_ADJ_PRC=0`(수정주가). 종가 `output2[].stck_clpr`. ~100행/호출.
- **Decision 해외**: `GET /uapi/overseas-price/v1/quotations/dailyprice`, `tr_id: HHDFS76240000`. `EXCD`,`SYMB`,`GUBN=0`(일),`BYMD`(기준일),`MODP=1`(수정),`KEYB`(페이지). 종가 `output2[].clos`, 날짜 `xymd`.

## R5. 환율(USD/KRW) — KIS가 제공
- **Decision**: 해외 **현재가상세** `GET /uapi/overseas-price/v1/quotations/price-detail`, `tr_id: HHDFS76200200`의 **`output.t_rate`**(원/외화 환율). 미국 종목 1건 조회 시 가격+환율 동시 획득. python-kis가 동일 방식.
- **Series 필요 시**: `inquire-daily-chartprice`(`tr_id FHKST03030100`, `FID_COND_MRKT_DIV_CODE=X`=환율). 단 USD/KRW의 `FID_INPUT_ISCD` 코드 문자열은 포털 코드표 확인 필요(불확실 플래그).
- **Rationale**: 별도 `/exchange-rate` 없음. `t_rate`가 가장 단순·확정적.

## R6. 종목 검색(한글) — 종목마스터 로컬 인덱싱
- **Decision**: KIS엔 **키워드/한글 검색 REST API 없음**(psearch는 HTS 저장조건용). 표준 방식 = **종목마스터 다운로드 후 로컬 인덱싱**.
  - 국내: `https://new.real.download.dws.co.kr/common/master/kospi_code.mst.zip`, `.../kosdaq_code.mst.zip`(고정폭, `단축코드`+`한글명`).
  - 해외: `https://new.real.download.dws.co.kr/common/master/{mkt}mst.cod.zip`({mkt}=nas,nys,ams,…; 탭구분, Symbol+한글명+영문명+거래소+통화).
- **Rationale**: 한글검색(야후 한계)·해외 EXCD 매핑을 동시에 해결. 일 1회 동기화해 인덱싱(기존 `etf_ter_cache`·KRX 동기화 패턴과 동일).
- **Alternatives**: 텍스트 검색 API(없음), 야후 검색 유지(한글 안 됨 — 거부).

## R7. 레이트리밋·도메인
- **Decision**: 실전 20req/s, 모의 5req/s, 토큰 1회/분. 시세 tr_id는 실전·모의 동일. 해외 시세는 모의 제한적 → **시장데이터는 실전 도메인 사용**. 기존 `revalidate` 캐시로 호출 억제 + 클라이언트측 스로틀 큐.
- 실전 `https://openapi.koreainvestment.com:9443`, 모의 `https://openapivts.koreainvestment.com:29443`.

## 미해결/주의
- `X`마켓 USD/KRW 차트 심볼코드 — 포털 코드표 확인(현 설계는 `t_rate` spot 우선 사용해 회피).
- 해외 무료 15분 지연 — 본인/베타 단계 허용(SC-002의 "시점차 외 0"에 부합).
