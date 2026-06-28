# Research: 마이버크셔 ETF 투자자 뷰

## 1. ETF vs 개별주 분류 방법

**Decision**: `secMeta[symbol].assetType === "ETF"` 로 판별. `secMeta`는 growth/page.tsx에서 이미 `loadSecurityMeta(supabase, data.allocation.map(a => a.symbol))`로 로드 중.

**Rationale**: `assetTypeOf()` 함수(`src/lib/securities.ts:35`)가 카탈로그→야후 instrumentType→심볼 패턴 순서로 안정적으로 분류. 이미 `secMeta`가 growth page에 있어 추가 DB 쿼리 없음.

**Available data**:
- `data.allocation` — `AllocationSlice[]`. `assetType` 필드 없음(심볼만). `secMeta` 교차로 분류.
- `secMeta[symbol].assetType` — `"ETF"` / `"주식"` / `"코인"` / 원자재 등
- ETF 판별: `assetType === "ETF"`
- 개별주 판별: `assetType !== "ETF"` (주식·코인·원자재 모두 포함)

---

## 2. TER 데이터 가용성

**Decision**: 한국 ETF(6자리 코드)만 `etf_ter_cache`에서 조회. 미국 ETF TER은 이 MVP에서 생략.

**Rationale**: `fetchKrxEtfTers(symbols, supabase)` 함수(`src/lib/finance/krxEtf.ts:32`)가 이미 bulk 조회를 지원. 미국 ETF는 `etf_ter_cache`가 6자리 코드 필터 처리 → 자동으로 제외.

**Behavior**: TER 없는 종목은 가중평균 계산에서 제외. 커버 비율("TER 적용 xx% 비중")은 표시하지 않음 — 불필요한 복잡도.

---

## 3. 섹터 데이터 (Yahoo API)

**Decision**: MVP에서 섹터 데이터는 생략. 비중(weight)과 TER만 표시.

**Rationale**: `getEtfStats(symbol)` 호출은 외부 Yahoo API 요청으로 느림. BusinessSnapshot처럼 스트리밍 처리를 하면 복잡도 증가. ETF 현황 카드의 핵심 가치(TER 비용 의식 + 보유 비중)는 API 없이도 전달 가능.

**Future**: 섹터 데이터는 Phase 2에서 BusinessSnapshot처럼 Suspense 스트리밍으로 추가 가능.

---

## 4. 잠금 카드 기존 패턴

**Decision**: 기존 잠금 UI 패턴 없음 → 새로 만들되 토스 스타일(회색 카드)로 최소하게.

**Rationale**: 코드베이스 전체 검색 결과 "lock" UI 컴포넌트 없음. Constitution IV(토스급 절제) 준수: 배경 회색 + 최소 텍스트. Constitution II(정직): 죄책감 없는 중립 톤.

**Design**: 
```
bg-secondary rounded-2xl p-5
  "[아이콘 없음] [제목]"
  "[회색 텍스트] ETF를 보유하면 열립니다"
```
별도 자물쇠 아이콘·애니메이션 없음. docs/mockups 기준선 참고.

---

## 5. Growth Page 렌더링 순서

**Decision**: 기업 스냅샷 → ETF 현황 순서. 기존 컴포넌트 위치 최대한 유지.

**Rationale**: 개별주 투자자가 대부분이므로 기업 스냅샷이 더 중요한 위치(위). ETF 현황은 "추가 정보"로 아래에 위치.

**카드 순서**:
1. CompanyTierCard (항상)
2. BusinessSnapshotStreamed / LockedCard (개별주 없으면 잠금)
3. EtfSnapshotCard / LockedCard (ETF 없으면 잠금) ← 신규
4. StyleCard (항상)
5. 분기 리포트·타임라인 (기존)
