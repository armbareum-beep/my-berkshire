# Feature Specification: 038 후속 — 자산 구성·보유 종목·투시 순이익 정합성 수정

**Feature Branch**: `claude/ipo-button-founding-confirmation-r06fma` (main에서 재시작)
**Created**: 2026-07-07
**Status**: Implemented (PR #47 머지 완료)
**Input**: 038 배포 후 사용자 피드백 4건 — "부동산·상가·수익형이 왜 따로 분배돼 있어?", "주식에서 버크셔해서웨이가 따로 나뉘어져 있어", "보유 종목 비율은 전체가 아니라 시세 있는 자산(주식·ETF·원자재) 기준으로", "내 지분 실적이 6억↔5억으로 나오는데 둘 다 말이 안 돼"

## 개요

038(랭커 자산구성 도넛 + 보유 종목 공시)을 배포한 뒤 드러난 4가지 정합성 문제를 수정한다. 셋은 표시/집계 로직, 하나(심볼 표기)는 데이터 정합성 + 재발 방지 코드다.

## 명시적 결정

1. **부동산 계열 병합** — 자산 구성 도넛에서 실물자산 종류(주택/토지/상가·수익형)를 각각 슬라이스로 두지 않고 `assetDivision === "REAL_ESTATE"`인 것을 **"부동산" 한 슬라이스로 병합**한다. 비상장·지분/실물·수집/기타는 종류 라벨 유지(사업부 성격이 달라 병합하지 않음).
2. **보유 종목 비중 분모 = 시세 있는 자산 합** — 보유 종목 목록의 비중 분모를 "투자자산 + 현금"에서 **시세 있는 자산(주식·ETF·원자재·코인 = positions 전체) 합**으로 바꿔 항목 합계가 100이 되게 한다. 전체 자산 대비 비중(현금·실물 포함)은 자산 구성 도넛이 담당 — 역할 분리.
3. **심볼 표기 정규화 통일** — 종목 심볼의 표준 표기는 대시(Yahoo/SEC 형식, `BRK/B` → `BRK-B`). 모든 쓰기 경로(거래 기록·온보딩 스냅샷·온보딩 개별 매수·가져오기 복원·securities upsert)가 `normalizeSymbol`을 거쳐 저장한다. 같은 종목이 표기 차이로 두 포지션으로 갈라지지 않게 한다.
4. **투시 순이익 정확도** — /growth "내 지분 실적"(look-through net income)의 결함을 수정한다: (a) 발행주식수 fact 를 값 기준 dedupe 합산(중복 제보 제거), (b) SEC CIK 조회 전 심볼 정규화(슬래시 표기 누락 방지), (c) **주식 클래스 단위 환산** — 복수 클래스 기업(버크셔)은 재무제표가 A주 환산 단일 주식수(~144만)로만 보고하는데 보유는 B주(예: 61주)라 단위가 ~1500× 어긋난다. `SHARE_CLASS_DIVISOR` 테이블(`BRK-B`: 1500)로 보유수량을 A주 환산 단위로 맞춰(÷1500) 정확한 지분율·"내 몫"을 계산한다(B주 1500개 = A주 1개). (d) **지분 단위 정합성 가드(백업)** — 환산 테이블에 없는 미등록 복수 클래스 종목이 남아 지분율이 부풀면, 회사 내재 PER(시총/순이익) 절댓값이 1 미만인 레그를 단위 불일치로 보고 합산에서 제외한다(정상 종목 오탐 없음 — going concern P/E<1은 사실상 불가). 제외 레그는 "지분 단위 불일치(복수 주식 클래스 추정)"로 표기.
5. **기존 갈라진 데이터 정리** — 이미 두 표기로 저장된 데이터(`BRK/B` 56주 + `BRK-B` 5주)는 코드 배포로는 안 합쳐지므로, `events.symbol`·`securities`를 `BRK-B`로 일괄 갱신해 61주 한 포지션으로 통합한다(수동 데이터 정리, 사용자 승인 후 실행).

## Requirements

### Functional Requirements

- **FR-001**: `manualCompositionInput`(`src/lib/rankingComposition.ts`)은 부동산 사업부(REAL_ESTATE) 실물자산을 "부동산" 단일 라벨로 합산해야 한다. 다른 사업부는 종류 라벨을 유지한다.
- **FR-002**: `computeHoldingsPct`(`src/lib/rankingHoldings.ts`)의 비중 분모는 시세 있는 자산 합이어야 하며, 항목 pct 합계는 100(반올림 보정 후)이어야 한다. `cash` 인자는 제거한다.
- **FR-003**: `normalizeSymbol`(`src/lib/securities.ts`, 슬래시→대시)을 모든 심볼 쓰기 경로가 사용해야 한다 — `transactions/actions.ts`(recordTransaction·quickEntry), `onboarding/actions.ts`(foundCompany 스냅샷 BUY·recordFirstBuy), `import/actions.ts`(reconstructPosition), `upsertSecurities`.
- **FR-004**: `sharesAt`(`src/lib/finance/edgar.ts`)은 같은 시점의 주식수 fact를 값 기준 dedupe 후 합산해야 한다(중복 제보 제거). 단일 클래스는 정확.
- **FR-005**: EDGAR CIK 조회(`cikOf`)는 티커를 대문자화 + 슬래시→대시 정규화한 뒤 매칭해야 한다. 4개 조회 지점(getDisclosuresUS·getSicDescriptionUS·getBusinessSectionUS·getFundamentalsUS) 모두 적용.
- **FR-006**: `toReportedShareUnit(symbol, quantity)`(`src/lib/finance/lookThrough.ts`)는 보유수량을 재무제표 발행주식수 단위로 환산해야 한다 — 버크셔 B주(`BRK-B`)는 A주 환산이므로 ÷1500, 미등록 종목은 그대로. `aggregate`의 지분율은 이 환산값 ÷ 발행주식수여야 한다. 이로써 버크셔 B주가 정확한 "내 몫"으로 합산된다.
- **FR-007**: `isShareClassUnitMismatch`(`src/lib/finance/lookThrough.ts`)는 회사 내재 PER(=보유 시장가치 / (회사 순이익 × 지분율)) 절댓값이 1 미만이면 true를 반환해야 하며(value=0·netIncome=0/null이면 false), `aggregate`는 true인 후보 레그를 합산에서 제외하고 no_disclosure 로 표기해야 한다 — `toReportedShareUnit` 테이블에 없는 미등록 복수 클래스 종목의 백업 방어선.

### Key Entities

- 스키마 변경 없음. `ranking_scores.holdings`/`composition` jsonb 값의 의미만 바뀌며 각 랭커의 다음 방문 upsert 때 재계산된다.
- 데이터 정리: `events`(symbol BRK/B→BRK-B, 2건)·`securities`(BRK/B 행 삭제).

## Edge Cases

- 038 이전 스냅샷 행: 렌더는 정상(방어적 파서), upsert 갱신 시 새 기준 반영.
- 단일 클래스 미국 종목: `sumClassShares`가 fact 1개면 그 값 그대로 — 회귀 없음.
- 시세/환율 조회 실패: 투시 순이익은 시세 무관(공시 기반)이라 영향 없음. 도넛·보유 종목은 priceAvailable=false면 null(섹션 생략).

## Success Criteria

- **SC-001**: 부동산 계열 자산이 여럿이어도 도넛에 "부동산" 한 슬라이스로 표시된다.
- **SC-002**: 보유 종목 목록의 비중 합이 100%다.
- **SC-003**: 어느 화면에서 같은 종목을 매수해도 동일 표기로 저장돼 한 포지션으로 합쳐진다.
- **SC-004**: 버크셔(B주) 보유의 투시 순이익 기여가 지분율(보유수량÷총발행주식수) × 순이익의 현실적 값(수십만 원대)으로 계산된다.
- **SC-005**: 데이터 정리 후 `BRK-B` 단일 포지션 61주, `BRK/B` 흔적 없음.

## Assumptions

- 038의 공개 범위·불변식(금액·수량 비공개, %·종목명만 공개)은 이 수정으로 완화되지 않는다.
- 복수 클래스 경제 가중 정밀 반영은 범위 밖(별도 개선 과제) — 현재는 클래스 합산 근사로 왜곡을 제거하는 데 집중한다.
