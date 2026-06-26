# Phase 1 Data Model: 종목·증권사 로고 일관 적용

이 기능은 **DB 스키마 변경이 없다**. 아래는 화면 표시를 위해 컴포넌트 경계로 흐르는 데이터 형태와,
유일한 구조 변경인 증권사 설정 상수 확장이다.

## 1. 자산배분 목록 아이템 (allocation item) — view model

`allocation/stock`·`allocation/sleeve/[type]`에서 목록 렌더에 쓰는 임시 객체.

| 필드 | 타입 | 설명 | 변경 |
|---|---|---|---|
| `label` | string | 표시명(종목명 또는 "현금") | 기존 |
| `value` | number | 평가액(표시 통화) | 기존 |
| `weight` | number | 비중(0~1) | 기존 |
| `symbol` | string \| undefined | 종목 코드. 현금 행은 undefined | **추가** |

- 출처: `computeDashboard().allocation`(이미 `{symbol, name, value, weight}` 보유). 현금 합성 행만 `symbol` 없음.
- 규칙: `symbol`이 있으면 `<SymbolAvatar symbol name />`, 없으면 `name`만 → 글자 폴백(FR-003).

## 2. 거래 내역 행 (ActivityItem) — 기존, 변경 없음

| 필드 | 타입 | 설명 |
|---|---|---|
| `type` | EventType | BUY/SELL/DIVIDEND/DEPOSIT/WITHDRAWAL/EXCHANGE |
| `symbol` | string \| null | 종목 코드. 비종목 거래는 null |
| ... | ... | (기타 기존 필드) |

- 규칙(렌더 분기): `symbol`이 truthy면 선두에 종목 `Avatar`(symbol, name=`names[symbol] ?? 카탈로그명 ?? symbol`).
  null이면 기존 유형 `IconChip`. **데이터 변경 없음 — 렌더 로직만 분기.**

## 3. Broker (증권사 설정 상수) — 구조 확장

`src/lib/config/brokers.ts`의 `Broker` 인터페이스.

| 필드 | 타입 | 설명 | 변경 |
|---|---|---|---|
| `id` | string | 증권사 식별자(예: "toss") | 기존 |
| `name` | string | 표시명(예: "토스증권") | 기존 |
| `commissionRate` | number | 대표 수수료율 | 기존 |
| `color` | string | 이니셜 배지 브랜드 컬러(폴백용) | 기존 |
| `domain` | string \| undefined | 공식 도메인(favicon 소싱용, 예: "tossinvest.com") | **추가** |

- `domain`은 선택적: 없으면 favicon 후보를 건너뛰고 셀프호스팅→이니셜·색만.
- 9개 프리셋(toss/kiwoom/korea/mirae/samsung/nh/kb/shinhan/daishin)에 도메인 채움.

## 4. 로고 후보 결정 (파생, 순수 함수)

기존 `assetImage(symbol, name) → { srcs[], fit, ... }`는 변경 없음(종목용).

증권사용 파생 규칙(헬퍼, 신규 — `brokerImage(broker)` 또는 BrokerChip 내 인라인):

```
srcs = [
  `/brokers/${id}.svg`,   // 셀프호스팅 1순위(있으면)
  `/brokers/${id}.png`,
  domain ? gfavicon(domain) : (생략),
]
모두 실패 → 이니셜(name[0]) + color 배지
```

- `fit`: favicon·워드마크는 여백 없어 **inset**(내접) — 국기·운용사 favicon과 동일 규칙.
- 불변식: 후보가 비어도(=domain 없고 파일 없음) 항상 이니셜+색 폴백으로 무중단(SC-005).

## 상태 전이 / 생명주기

해당 없음 — 표시 전용. 영속 상태·전이 없음.
