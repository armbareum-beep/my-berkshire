# Phase 1 Data Model: 표시 모델 (read-only)

DB 스키마 변경 없음. 아래는 **표시 계층 타입**(엔진/캐시 결과를 UI 상태로 옮기는 모델)이다. 원장(`events`)·보유 회계는 불변(헌장 V).

## 1. AssetImage (User Story 1)

자산 1개 → 어떤 이미지를 그릴지 결정한 결과.

```text
AssetKind = "company" | "manager" | "index" | "crypto"

AssetImage {
  kind:   AssetKind          # 분류 결과
  src:    string | null      # 이미지 URL(없으면 null → 텍스트 폴백)
  source: "favicon" | "flag" | "coin" | "manager-favicon" | "none"
  alt:    string             # 접근성 텍스트(이름)
}
```

- **결정 함수**: `assetImage(symbol?, name?, opts?) → AssetImage` (순수, 동일 입력 → 동일 출력 ⇒ FR-004 일관성).
- **분류 규칙(우선순위)**:
  1. `symbol` `-USD` 끝 또는 코인 세트 → `crypto` → `public/coins/{slug}.svg`
  2. `symbol` `^` 시작(또는 PRESET `isIndex`) → `index` → 국가코드 → `public/flags/{cc}.svg`
  3. 6자리 코드 + ETF 브랜드 접두 → `manager` → 운용사 favicon(맵에 있으면), 없으면 `src=null`(운용사 약칭 폴백)
  4. 그 외 → `company` → favicon 도메인 맵(있으면), 없으면 `src=null`
- **불변식**: `src`가 null이거나 로드 실패면 항상 텍스트 폴백 렌더(깨진 이미지 0건, SC-002).
- **폴백 연계**: 텍스트 폴백은 기존 `brandLogoLabel(symbol,name)`(색·레이블) 사용.

## 2. IndexMetricCell (User Story 2)

지수 지표 한 칸의 표시 상태.

```text
MetricStatus = "value" | "unavailable" | "pending"
  # value       : 실제 값 있음
  # unavailable : 어떤 출처에도 없음(영구) → "정보 없음"
  # pending     : 출처는 있으나 아직 미동기화(한국 지수 KRX 캐시 빔) → "데이터 준비 중"

IndexMetricCell {
  label:  string             # "Trailing PER" | "PBR" | "ROE(상위10 가중)" | "배당수익률"
  value:  string | null      # 포맷된 표시값(예: "12.3배")
  status: MetricStatus
}
```

- **Forward PER 제거**: 지표 목록(셀 집합)에서 영구 제외. `IndexSummary.forwardPE`·`fetchQuoteSummary`의 forwardPE 페치도 제거(FR-008).
- **상태 산출**:
  - 값이 있으면 `value`.
  - 한국 지수(`^KS11`/`^KQ11`)이고 KRX 캐시 행 부재 → 해당 지표 `pending`.
  - 그 외 null → `unavailable`.
- **불변식**: 지표 영역이 통째로 비어 보이지 않음 — 최소 한 셀은 상태 라벨로 채워짐(FR-009).

## 3. FxDetail (User Story 3)

환율 상세 1개 통화쌍의 표시 모델.

```text
FxDetail {
  code:       string         # "USD" | "JPY" | "EUR"
  pairLabel:  string         # "원/달러" 등(currencyMeta.name 기반)
  cc:         string         # 국기 코드(currencyMeta.cc)
  rate:       number | null  # 현재 1 {code} = ₩rate (getFxToKrw)
  changeAbs:  number | null  # 전일 대비 ₩ 변동(일봉 파생)
  changePct:  number | null  # 전일 대비 % (등락색은 시세 등락에만 — 헌장 IV)
  high52:     number | null  # 52주 최고(일봉 파생)
  low52:      number | null  # 52주 최저(일봉 파생)
  daily:      DailyBar[]     # 1년 일봉(₩=환율값)
  monthly:    DailyBar[]     # 전체 월봉
}
```

- **출처**: `rate`=`getFxToKrw([code])`, 시계열=`getDailyKrwCloses(["{code}KRW=X"])`. `change*`·`high52`·`low52`는 `daily`에서 파생.
- **결측 처리**: `daily` 비면 차트 영역만 "데이터 없음/재시도", `rate`는 유지(FR-015).
- **지원 통화**: `CURRENCIES`에서 KRW 제외(USD·JPY·EUR). 알 수 없는 code 진입 시 404(`notFound`).

## 관계 요약

- AssetImage·IndexMetricCell·FxDetail 셋 다 기존 read 소스(브랜드맵/PRESET, KRX 캐시+야후, FX+시세)에서 파생되는 **표시 전용** 모델. 쓰기·원장 영향 없음.
- 공통 원칙: 값 없음을 **상태로 정직하게** 표기(헌장 II), 신규 외부/유료 의존·DB 변경 없음.
