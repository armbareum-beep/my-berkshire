# Research: 거장 13F 자동 파이프

**Branch**: `018-13f-auto-pipeline` | **Phase**: 0 Research

---

## R1. 현재 코드베이스 상태

### `src/lib/finance/legends.ts`
- `Legend`: `key`, `name`, `firm`, `quarterLabel`, `source`, `longReturn?`, `holdings[]`
- `LegendHolding`: `ticker`, `name`, `weight`(0–1), `prevWeight`(변화 추적용)
- **현재 3거장 하드코딩**: Warren Buffett(버크셔), Cathy Wood(ARK), Bill Ackman(Pershing Square)
- 데이터 기준: 2025 1Q, 수동 갱신
- CIK 번호 없음

### `src/components/benchmark/LegendExplorer.tsx`
- 탭: 포트폴리오 / 매수 / 매도 (이미 구현됨)
- 아바타 선택 → 도넛 + 보유목록 + 변화 탭
- `src/app/allocation/page.tsx`에서 `LegendExplorerStreamed`로 렌더

### `src/lib/finance/edgar.ts`
- SEC EDGAR submissions API 이미 사용 중 (`fundamentals_cache`)
- `https://data.sec.gov/submissions/CIK{cik}.json` 패턴 확립
- `company_tickers.json`으로 ticker→CIK 매핑 (역방향)
- CUSIP 처리 없음

---

## R2. SEC EDGAR 13F 데이터 소스

### Decision: SEC EDGAR 공개 API (인증 불필요)
- **submissions API**: `https://data.sec.gov/submissions/CIK{cik0}.json`
  - `filings.recent.form[]`에서 `"13F-HR"` 필터 → accessionNumber 추출
- **13F XML**: `https://www.sec.gov/Archives/edgar/data/{cik}/{accession}/infotable.xml`
  - `<informationTable>`의 각 `<infoTable>` 항목:
    - `nameOfIssuer`, `titleOfClass`, `cusip`, `value`(1000달러 단위)
    - `shrsOrPrnAmt` → `sshPrnamt`(주수), `sshPrnamtType`
    - `investmentDiscretion`(SOLE/SHARED/OTHER)

### Known CIK Numbers
| 거장 | 기관명 | CIK |
|------|--------|-----|
| Warren Buffett | Berkshire Hathaway | 0001067983 |
| Cathy Wood | ARK Investment Management | 0001819062 |
| Bill Ackman | Pershing Square Capital | 0000875588 |

- **Rationale**: SEC EDGAR는 무료 공개 API, 인증 불필요, 기존 edgar.ts와 동일 패턴
- **Alternatives**: Bloomberg/Refinitiv(유료), WhaleWisdom(스크래핑)

---

## R3. CUSIP → 티커 매핑

### Decision: OpenFIGI API (1순위) + SEC 커버페이지 파싱(폴백)

**OpenFIGI**:
- `POST https://api.openfigi.com/v3/mapping`
- Body: `[{"idType":"ID_CUSIP","idValue":"XXXXXXXXX"}]`
- 무료, API Key 선택적, US 상장 종목 99%+ 커버
- Rate limit: 10 req/분(비인증), 20 req/분(키 있음)
- 배치 가능: 한 요청에 최대 100개 CUSIP

**SEC 커버페이지 폴백**:
- 13F XML 커버 섹션에 간혹 ticker 포함
- 상장폐지·합병 종목은 매핑 실패 → "Unknown(CUSIP)" 표시

**캐시 전략**: `cusip_ticker_cache` 테이블로 재조회 최소화 (분기별 변경 없으면 재사용)

- **Rationale**: OpenFIGI는 무료·공개, 기존 fetch 패턴 그대로 사용 가능
- **Alternatives rejected**: SEC company_tickers.json(CUSIP 없음), 수동 매핑(유지보수 불가)

---

## R4. 스케줄러 구현 방법

### Decision: TypeScript 동기 스크립트 + Vercel Cron

**개발/수동**: `npm run sync:13f` (기존 `scripts/syncKrxTer.ts` 패턴 동일)
- `tsx scripts/sync13fHoldings.ts` 실행
- Windows Task Scheduler 또는 수동 트리거

**프로덕션**: Vercel Cron (`/api/cron/sync-13f`)
- `vercel.json`에 cron 추가 (분기별: `0 9 16 2,5,8,11 *`)
  - 2월·5월·8월·11월 16일 오전 9시 = 분기 종료 45일 후 기준
- 기존 `vercel.json`에 `regions: ["icn1"]` 이미 있음, cron 블록 추가

**Supabase pg_cron**: 미채택 — config.toml에 미설정, Vercel cron이 더 단순

- **Rationale**: 기존 sync 스크립트 패턴 일관성 유지, Vercel cron은 추가 인프라 불필요
- **Alternatives rejected**: Supabase Edge Function(pg_cron 설정 복잡), GitHub Actions(저장소 접근 복잡)

---

## R5. UI 변경 최소화 전략

### Decision: LegendExplorer를 DB 기반으로 전환, 인터페이스는 유지

- `Legend` interface: `cikStr` 추가, `quarterLabel` → DB에서 동적, `holdings` → DB 조회로 교체
- `LegendHolding`: 기존 `weight/prevWeight` 유지 + `cusip`, `sharesHeld`, `marketValueUsd` 추가
- UI 탭 구조(포트폴리오/매수/매도) 기존과 동일 — 변화는 현재 `prevWeight`로 이미 계산 중, DB의 전 분기 데이터로 교체
- 서버 컴포넌트로 DB 조회 후 LegendExplorer에 props 전달 (기존 패턴)

---

## R6. 기존 edgar.ts 재사용 범위

- `fetchSubmissions(cik)` 패턴 → 13F 필터링에 재사용 가능
- `edgar.ts`에 `fetch13fLatest(cik: string)` 함수 추가
- XML 파싱: `@xmldom/xmldom` 또는 `DOMParser` (Supabase Edge) / `xml2js` (Node 스크립트)
- 기존 프로젝트에 xml 파서 없음 → `fast-xml-parser` 추가 검토 또는 regex로 충분 (구조 단순)
