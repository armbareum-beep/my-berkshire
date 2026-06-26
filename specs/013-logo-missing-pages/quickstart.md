# Quickstart: 종목·증권사 로고 일관 적용

## 목표 한 줄

자산배분·거래 내역·계좌 화면이 보유·수익률 화면과 **같은 로고 파이프라인**을 타게 한다. 새 표시
규칙을 만들지 않는다.

## 변경 지점 체크리스트(구현 순서 권장)

1. **공용 프리미티브 추출** — `src/components/ui/LogoImage.tsx` 신규. `Avatar.tsx`의 순차 폴백 `<img>`
   로직(failIdx/onError/resetKey)을 이전. `Avatar`는 이를 사용하도록 리팩터(동작 보존, C2.1).
2. **자산배분(US1, P1)** — `allocation/stock/page.tsx`·`allocation/sleeve/[type]/page.tsx`의 목록 아이템에
   `symbol: a.symbol` 추가, 현금 행은 미포함. 렌더를 `<SymbolAvatar name=… symbol=… />`로.
3. **계좌(US3, P2)** — `lib/config/brokers.ts`에 `domain` 필드 + 9개 프리셋 도메인. `BrokerChip`을
   `LogoImage`로 전환(후보: 셀프호스팅→favicon, 폴백: 이니셜+색).
4. **거래 내역(US2, P2)** — `ActivityList.tsx`에서 `it.symbol` 있으면 선두를 종목 `Avatar`로, 없으면
   기존 유형 `IconChip` 유지. 텍스트 라벨·금액 색 유지.
5. **(선택) 셀프호스팅 로고** — 고품질이 필요하면 `public/brokers/{id}.svg` 직접 배치(1순위).

## 빠른 검증

```bash
npx tsc --noEmit          # 타입 클린
npx eslint <changed>      # 린트 클린
npx vitest run <unit>     # 증권사 로고 후보 순수함수 테스트(있다면)
```

화면 육안 확인(`run`/`verify` 스킬):
- 자산배분 종목 목록: 종목 로고가 보유 목록과 동일 / 현금 행은 글자 폴백.
- 거래 내역: 종목 매수·매도·배당 행에 종목 로고 / 입금·출금·환전은 유형 아이콘 / 유형 라벨 유지.
- 계좌: 증권사 로고(또는 favicon) / 없는 증권사·직접입력은 이니셜+색 / 깨진 이미지 0건.

## 수용 기준 매핑

| 화면 | spec |
|---|---|
| 자산배분 | US1, FR-001, SC-001/002 |
| 거래 내역 | US2, FR-002/003, SC-001 |
| 계좌 | US3, FR-006, SC-005 |
| 폴백 무중단 | FR-004, SC-003 |
| 화면 간 일관 | FR-005, SC-004 |

## 주의

- 증권사 로고는 기존에 **의도적으로** 이니셜+색만 썼다(라이선스). favicon 폴백으로 켜되, 품질·권리
  이슈가 있으면 셀프호스팅 SVG로 대체. 어느 경우든 폴백이 보장돼 깨지지 않는다.
- DB·계산 엔진 변경 없음 — 회귀 위험은 표시 레이어에 한정.
