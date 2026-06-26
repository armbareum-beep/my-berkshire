# Contract: 13F Sync Pipeline

**Branch**: `018-13f-auto-pipeline`

---

## 동기 스크립트: `scripts/sync13fHoldings.ts`

### 책임
SEC EDGAR에서 등록된 모든 거장의 최신 13F를 수집·파싱·저장한다.

### 실행 진입점
```
npm run sync:13f
# → tsx scripts/sync13fHoldings.ts
```

### 동작 순서
```
1. legend_registry에서 활성 거장 목록 조회 (cik_str 기준)
2. 거장별 (병렬):
   a. SEC EDGAR submissions API → 최신 13F-HR accession 탐색
   b. 이미 동일 (year, quarter) 스냅샷이 있으면 스킵
   c. 13F XML infotable 다운로드·파싱
   d. CUSIP 배치 → cusip_ticker_cache 확인 → 미캐시 항목만 OpenFIGI API 호출
   e. legend_13f_snapshots INSERT (ON CONFLICT DO NOTHING)
   f. legend_13f_holdings INSERT (배치)
   g. legend_registry.last_synced_at 갱신
3. 완료 로그 출력 (거장별 성공/스킵/실패 요약)
```

### 실패 격리
- 한 거장 실패 → 해당 거장만 스킵, 나머지 계속 진행
- CUSIP 매핑 실패 → `ticker = null`, `issuer_name` 유지
- 네트워크 오류 → 재시도 3회(지수 백오프), 이후 스킵

### 환경 변수
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (기존 동일)
- `OPENFIGI_API_KEY` (선택, 없으면 비인증 사용)

---

## Vercel Cron 엔드포인트: `src/app/api/cron/sync-13f/route.ts`

### 계약
```
GET /api/cron/sync-13f
Authorization: Bearer {CRON_SECRET}   ← vercel.json 자동 주입
```

### 응답
```json
{ "ok": true, "legends": 3, "newSnapshots": 1, "durationMs": 4200 }
```

### 에러 응답
```json
{ "ok": false, "error": "...", "partial": { "succeeded": 2, "failed": 1 } }
HTTP 200 (항상 — Vercel이 실패로 재시도 안 하도록)
```

### `vercel.json` 추가 내용
```json
{
  "crons": [
    {
      "path": "/api/cron/sync-13f",
      "schedule": "0 9 16 2,5,8,11 *"
    }
  ]
}
```
(2·5·8·11월 16일 UTC 09:00 = 분기 종료 45일 기준 여유 있는 시점)

---

## DB 조회 함수: `src/lib/finance/legends.ts`

### `fetchLegendsFromDb(supabase): Promise<Legend[]>`
- `legend_registry` JOIN `legend_13f_snapshots`(최신 분기) JOIN `legend_13f_holdings` 조회
- 이전 분기 스냅샷도 함께 조회하여 `change` 분류 계산
- 반환: `Legend[]` (기존 인터페이스와 호환)

### `fetchLegendHoldings(supabase, legendId, year, quarter): Promise<LegendHolding[]>`
- 특정 분기 보유 목록
- 전 분기 데이터가 있으면 `prevWeight` / `change` 채움

### 폴백
- DB 조회 실패 시 기존 하드코딩 상수 반환 (에러 경계)
