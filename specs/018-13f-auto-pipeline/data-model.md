# Data Model: 거장 13F 자동 파이프

**Branch**: `018-13f-auto-pipeline` | **Phase**: 1 Design

---

## 신규 테이블

### `legend_registry`
거장 목록 및 SEC EDGAR 메타데이터.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | `uuid` PK | 내부 ID |
| `key` | `text` UNIQUE | 기존 legends.ts 키와 동일 (e.g. `"buffett"`) |
| `name` | `text` | 표시 이름 |
| `firm` | `text` | 기관명 |
| `cik_str` | `text` | SEC CIK (10자리 0패딩, e.g. `"0001067983"`) |
| `logo_key` | `text` | 아바타 이미지 키 |
| `long_return` | `numeric` nullable | 장기 수익률 (선택, 표시용) |
| `last_synced_at` | `timestamptz` nullable | 마지막 성공 수집 시각 |
| `created_at` | `timestamptz` | 등록 시각 |

**초기 데이터** (마이그레이션 INSERT):
- `buffett` / Berkshire Hathaway / `0001067983`
- `ark` / ARK Investment Management / `0001819062`
- `ackman` / Pershing Square Capital / `0000875588`

---

### `legend_13f_snapshots`
분기별 13F 제출 스냅샷. 거장당 분기당 1건.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | `uuid` PK | 내부 ID |
| `legend_id` | `uuid` FK→legend_registry | 거장 |
| `filing_year` | `smallint` | 신고 연도 (e.g. 2025) |
| `filing_quarter` | `smallint` CHECK(1..4) | 분기 |
| `filed_at` | `date` | SEC 제출일 |
| `accession_number` | `text` | EDGAR accession (재다운로드용) |
| `total_value_usd` | `bigint` | 총 신고 시가 (달러, 1000달러 단위 → 달러 환산) |
| `holding_count` | `int` | 종목 수 |
| `synced_at` | `timestamptz` | 수집 시각 |

**UNIQUE**: `(legend_id, filing_year, filing_quarter)` — 동일 분기 중복 방지

---

### `legend_13f_holdings`
스냅샷별 보유 종목 행.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | `uuid` PK | 내부 ID |
| `snapshot_id` | `uuid` FK→legend_13f_snapshots | 스냅샷 |
| `cusip` | `text` | CUSIP 9자리 |
| `ticker` | `text` nullable | 내부 티커 (매핑 성공 시) |
| `issuer_name` | `text` | 13F 원문 종목명 |
| `shares_held` | `bigint` | 보유 주수 |
| `market_value_usd` | `bigint` | 신고 시가 (달러) |
| `investment_discretion` | `text` CHECK('SOLE','SHARED','OTHER') | 투자 재량 유형 |
| `weight` | `numeric(8,6)` | 전체 포트폴리오 대비 비중 (0–1) |

**UNIQUE**: `(snapshot_id, cusip)` — 스냅샷 내 CUSIP 중복 방지

---

### `cusip_ticker_cache`
CUSIP → 티커 매핑 캐시. 재조회 최소화.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `cusip` | `text` PK | CUSIP 9자리 |
| `ticker` | `text` nullable | 티커 (null = 매핑 실패) |
| `issuer_name` | `text` | 종목명 |
| `exchange` | `text` nullable | 거래소 코드 |
| `last_verified_at` | `timestamptz` | 마지막 조회 시각 |

---

## 기존 인터페이스 변경

### `src/lib/finance/legends.ts`

**변경 전 `Legend`**:
```
key, name, firm, quarterLabel, source, longReturn?, holdings[]
```

**변경 후 `Legend`** (DB Row 매핑용):
```
key, name, firm, cikStr,
latestSnapshot: { year, quarter, filedAt } | null,
lastSyncedAt: Date | null,
holdings: LegendHolding[]   ← DB에서 조회
```

**변경 후 `LegendHolding`**:
```
ticker: string | null,   ← null = Unknown(CUSIP)
cusip: string,
name: string,
weight: number,          ← snapshot 내 비중
prevWeight: number | null,   ← 전 분기 스냅샷 대비
sharesHeld: number,
marketValueUsd: number,
change: 'new' | 'added' | 'reduced' | 'exited' | 'unchanged'
```

---

## 상태 전이: `change` 분류

```
전 분기 없음 + 이번 있음  →  'new'
전 분기 있음 + 이번 없음  →  'exited'
shares 증가              →  'added'
shares 감소              →  'reduced'
shares 동일              →  'unchanged'
최초 스냅샷(전 분기 없음)  →  모든 항목 'new' 처리
```

---

## RLS 정책

- `legend_registry`, `legend_13f_snapshots`, `legend_13f_holdings`, `cusip_ticker_cache` 모두 **공개 읽기** (거장 정보는 사용자 소유 데이터 아님)
- 쓰기: `service_role`만 (sync 스크립트 전용)

---

## 마이그레이션 파일

`supabase/migrations/YYYYMMDDHHMMSS_legend_13f_pipeline.sql`

1. 테이블 4개 CREATE
2. UNIQUE 제약
3. RLS 정책 (public SELECT, service_role INSERT/UPDATE)
4. 초기 `legend_registry` INSERT (3거장)
