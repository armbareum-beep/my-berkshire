# Phase 0 Research: 종목·증권사 로고 일관 적용

명확화(Clarifications)로 "기존 파이프라인 재사용" 원칙이 확정되어 미해결(NEEDS CLARIFICATION)
항목은 없다. 아래는 재사용 대상 메커니즘과 각 surface의 현 상태·접근을 코드 기준으로 확정한 것.

## D1. 재사용할 기존 로고 파이프라인

- **Decision**: `src/components/ui/Avatar.tsx`가 `assetImage(symbol, name)`로 후보 URL 배열(`srcs`)을
  받아 `<img onError>`로 앞에서부터 순차 시도하고, 모두 실패하면 `brandLogoLabel`의 이니셜+색으로
  폴백한다. 이 메커니즘을 모든 surface가 타게 한다.
- **Rationale**: 보유·수익률·검색 화면이 이미 이 경로로 로고를 띄운다. 사용자 요구 = "다른 곳에서
  가져오는 방식 그대로". 새 규칙을 만들면 화면 간 불일치 위험만 커진다.
- **Alternatives considered**: (a) 화면별 개별 로고 로직 — 중복·불일치, 원칙 V 위반. (b) 외부 로고
  CDN 신규 도입 — 광고차단 차단 이슈([[logo-self-hosting]] 메모), 신규 의존. 모두 기각.

## D2. 폴백 `<img>` 로직의 공용화

- **Decision**: Avatar 내부의 "순차 폴백 + symbol 변경 시 인덱스 리셋" 로직을 작은 공용 프리미티브
  `LogoImage`로 추출한다. `Avatar`(종목)와 `BrokerChip`(증권사)이 함께 사용한다.
- **Rationale**: 증권사 배지가 같은 폴백 동작을 가지려면 로직 중복이 불가피한데, 추출하면 단일
  출처(원칙 V)로 동작이 항상 일치한다. Avatar 리팩터는 동작 보존(behavior-preserving).
- **Alternatives considered**: BrokerChip에 폴백 로직 복붙 — 중복·드리프트 위험으로 기각. assetImage에
  증권사를 끼워넣기 — 증권사는 자산이 아니라 의미 오염, 기각.

## D3. 자산배분(allocation) — symbol 누락

- **현 상태**: `allocation/stock/page.tsx`·`allocation/sleeve/[type]/page.tsx`가 목록 아이템을
  `{ label: a.name, value, weight }`로 만들며 **`a.symbol`을 버린다**. 그래서 `<SymbolAvatar name=… />`만
  넘어가 이니셜 폴백만 뜬다. 데이터 원천 `data.allocation`에는 `symbol`이 있다.
- **Decision**: 아이템에 `symbol`을 실어 `<SymbolAvatar name=… symbol=… />`로 전달. 현금 행은 종목이
  아니므로 `symbol` 없이(글자 폴백 유지, FR-003).
- **범위 확정**: 개별 종목 아바타를 렌더하는 자산배분 화면은 `stock`·`sleeve/[type]` 둘뿐. 메인
  `allocation/page.tsx`·`allocation/[tag]/page.tsx`는 종목 아바타가 아니라 도넛 색 점(범례)만 써서
  대상 아님.

## D4. 거래 내역(transactions) — 종목 로고 자리에 유형 아이콘

- **현 상태**: `ActivityList.tsx`가 모든 행에 거래유형 모노톤 아이콘(`IconChip icon={EVENT_ICON[type]}`)을
  선두에 둔다. 종목 로고는 없다. 종목명은 보조줄 텍스트로만 표시. `ActivityItem.symbol`(string|null)과
  `names` 맵은 이미 존재.
- **Decision(명확화 반영)**: 종목 연결 거래(BUY/SELL/DIVIDEND, `symbol` 존재)는 선두 아이콘을 종목
  `Avatar`(공용 경로)로 교체. 종목 없는 거래(DEPOSIT/WITHDRAWAL/EXCHANGE)는 기존 유형 IconChip 유지.
  거래유형 구분은 기존 굵은 텍스트 라벨(`LABEL[type]`)과 금액 부호·색으로 계속 전달(FR-002).
- **Rationale**: 다른 화면과 동일한 공용 로고 표시를 재사용하라는 명확화. 유형 색 점이 사라져도
  텍스트 라벨이 유형을 보존한다.
- **Alternatives considered**: 로고+유형 코너배지 병기(US1 질문의 옵션 A) — 사용자가 "새 배치 만들지
  말고 그대로"로 기각.

## D5. 계좌(accounts) — 증권사 로고 소싱

- **현 상태**: `BrokerChip`(BrokerSelect.tsx)이 의도적으로 이니셜+브랜드 컬러만 쓴다(brokers.ts 주석:
  "로고 에셋은 라이선스 부담 → 이니셜+컬러로 대체"). `Broker`는 `{id, name, commissionRate, color}`만 보유.
- **Decision**: `Broker`에 `domain?` 추가. `BrokerChip`을 `LogoImage`로 전환해 후보
  `[/brokers/{id}.svg, /brokers/{id}.png, gfavicon(domain)]` 순 시도, 모두 실패 시 기존 이니셜+컬러 배지로
  폴백. 운용사/ETF가 이미 쓰는 `gfavicon(domain)`과 동일 메커니즘이라 신규 의존 없음.
- **점진 적용**: 셀프호스팅 파일이 없어도 favicon이 즉시 로고를 제공하고, favicon마저 없으면 기존
  배지로 자연 폴백 → 에셋 일괄 확보 없이도 안전하게 켤 수 있다(SC-005). 셀프호스팅은 선택적 후속.
- **라이선스 주의**: 기존 결정의 역전. favicon은 식별 목적의 소형 표시로 운용사 로고와 동일 범주.
  고품질이 필요하면 `public/brokers/{id}.svg`를 직접 넣어 1순위로 올린다.

## D6. 검증 방법

- 순수 함수(증권사 로고 후보 산출)는 단위테스트(`assetImage.test.ts` 패턴).
- 화면 회귀: `run`/`verify` 스킬로 자산배분·거래 내역·계좌를 실제 구동, 로고/폴백·현금·입출금 행을
  육안 확인(SC-001~005). `npx tsc --noEmit`·`npx eslint` 클린(품질 게이트).
