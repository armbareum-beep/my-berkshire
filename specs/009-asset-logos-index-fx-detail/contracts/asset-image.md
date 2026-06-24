# Contract: assetImage() · Avatar 렌더 (User Story 1)

UI 계약(애플리케이션 내부 인터페이스). 외부 API 아님.

## 함수 계약

```text
assetImage(symbol?: string, name?: string, opts?: { country?: string; assetType?: string })
  → { kind, src, source, alt }
```

**입력**
- `symbol` — 코드(6자리)·티커·`^지수`·`-USD` 크립토·`=X` 환율 중 하나(없을 수 있음).
- `name` — 표시명(폴백 레이블·alt).
- `opts.country` — 지수 국기 매핑 힌트(PRESET `country`). 없으면 심볼로 추론.
- `opts.assetType` — 분류 보조(있으면 우선).

**출력 규칙(결정적·부작용 없음)**
| 조건 | kind | src | source |
|------|------|-----|--------|
| `-USD` 끝 / 코인 세트 | `crypto` | `/coins/{slug}.svg` (세트에 있을 때) | `coin` |
| `^` 시작 / `isIndex` | `index` | `/flags/{cc}.svg` (국가 매핑 시) | `flag` |
| 6자리 + ETF 브랜드 접두 | `manager` | 운용사 favicon (맵에 있을 때) | `manager-favicon` |
| 6자리 KR / US 티커 | `company` | favicon (도메인 맵에 있을 때) | `favicon` |
| 위에서 URL 미확정 | (분류된 kind 유지) | `null` | `none` |

**불변식**
- 동일 `(symbol,name,opts)` → 동일 결과(FR-004).
- 추측 이미지 금지: 도메인/매핑이 불확실하면 `src=null`(헌장 II) → 텍스트 폴백.

## Avatar 렌더 계약 (`components/ui/Avatar.tsx`)

- `assetImage()` 호출 → `src`가 있으면 `<img onError=폴백>`, 없으면 `brandLogoLabel` 텍스트 동그라미.
- 이미지 로드 실패(`onError`) → 즉시 텍스트 폴백(레이아웃 시프트 0, SC-002).
- 크기 `sm|md|lg` 기존 유지. 원형 컨테이너·`object-contain` 유지(작은 크기 가독성, Edge Case).
- 기존 `Avatar` props 시그니처(`name`,`symbol`,`size`,`className`) **하위호환 유지** — 모든 사용처(8 페이지+~10 컴포넌트) 자동 적용(FR-006).

## 정적 자산

- `public/flags/{cc}.svg` — 기존 존재(재사용).
- `public/coins/{slug}.svg` — 신규(btc·eth 등 보유 코인 세트). 국기와 동일 방식·로컬.

## 테스트(`assetImage.test.ts`)

- `005930`→company, `KODEX 200`(069500)→manager, `^KS11`→index(kr flag), `BTC-USD`→crypto(coin).
- 미등록 종목 → `src=null`(폴백 경로).
- 동일 입력 반복 → 동일 출력.
