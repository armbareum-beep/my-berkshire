# Phase 1 UI Contracts: 종목·증권사 로고

외부 API가 없는 클라이언트 표시 기능이므로, 계약은 **컴포넌트 인터페이스 + 폴백 보장**으로 정의한다.

## C1. `LogoImage` (신규 공용 프리미티브)

순차 폴백 `<img>`. `Avatar`와 `BrokerChip`이 공유.

```ts
function LogoImage(props: {
  srcs: string[];               // 앞에서부터 시도할 URL 후보
  alt: string;
  fit: "fill" | "inset";        // 원 채움 / 내접
  resetKey: string;             // 이 값이 바뀌면 후보 인덱스 0으로 리셋(stale 폴백 방지)
  fallback: React.ReactNode;    // 모든 후보 실패 시 렌더(이니셜+색 배지 등)
  className?: string;
}): JSX.Element
```

**계약(불변식)**:
- C1.1 `srcs[i]`가 `onError`면 `i+1`로 전진. 끝까지 실패하면 `fallback`을 렌더한다.
- C1.2 `srcs`가 빈 배열이면 즉시 `fallback`.
- C1.3 `resetKey` 변경 시 인덱스를 0으로 되돌린다(리스트 위치 재사용으로 인한 stale 방지).
- C1.4 깨진 이미지 아이콘을 절대 노출하지 않는다(항상 이미지 또는 fallback).

## C2. `Avatar` (기존, 동작 보존 리팩터)

```ts
function Avatar(props: { name: string; symbol?: string; size?: "sm"|"md"|"lg"; className?: string })
```

**계약**:
- C2.1 입력(symbol,name)이 같으면 리팩터 전후 **렌더 결과가 동일**해야 한다(behavior-preserving).
- C2.2 내부적으로 `assetImage(symbol,name)`의 `srcs/fit`을 `LogoImage`에 전달하고, `fallback`은 기존
  `brandLogoLabel` 이니셜+색 배지를 그대로 사용한다.

## C3. `SymbolAvatar` 사용처 (자산배분)

```tsx
// 종목 행: symbol 필수 전달
<SymbolAvatar name={it.label} symbol={it.symbol} />
// 현금 행: symbol 없음 → 글자 폴백
<SymbolAvatar name="현금" />
```

**계약**:
- C3.1 종목 행은 보유 목록 화면과 **동일한 로고**를 표시(SC-001).
- C3.2 현금 행은 로고를 끌어오지 않는다(SC-002).

## C4. 거래 내역 행 (ActivityList)

**계약**:
- C4.1 `item.symbol`이 있으면 선두 아이콘 = 종목 `Avatar(symbol, name)`.
- C4.2 `item.symbol`이 없으면(입금/출금/환전) 선두 아이콘 = 기존 유형 `IconChip`.
- C4.3 두 경우 모두 거래유형 텍스트 라벨(`LABEL[type]`)과 금액 부호·색은 유지(FR-002).
- C4.4 종목 로고가 없는 종목도 깨짐 없이 이니셜 폴백(SC-003).

## C5. `BrokerChip` (계좌 증권사 배지)

```ts
function BrokerChip(props: { id: string; size?: number }): JSX.Element | null
```

**계약**:
- C5.1 후보 순서 `/brokers/{id}.svg` → `/brokers/{id}.png` → `domain` 있으면 `gfavicon(domain)`.
- C5.2 모든 후보 실패 또는 후보 없음 → 기존 이니셜(name[0]) + `color` 배지로 폴백(SC-005).
- C5.3 `findBroker(id)`가 없으면 `null`(기존 동작 유지).
- C5.4 크기·원형·정렬은 기존 배지와 동일(레이아웃 회귀 없음).

## 검증 시나리오(수용 매핑)

| 계약 | spec 수용 시나리오 |
|---|---|
| C3.1 | US1-1 |
| C3.2 / C4.2 | US1-3 / US2-2 |
| C4.1, C4.3 | US2-1, US2-3 |
| C5.1 | US3-1 |
| C5.2 | US3-2 |
| C1.4/C4.4 | SC-003 |
