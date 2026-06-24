# Contract: 환율 상세 라우트 (User Story 3)

## 라우트

```text
GET /fx/[code]      code ∈ { USD, JPY, EUR }   (CURRENCIES − KRW)
```
- 알 수 없는 code → `notFound()` (404).
- 페이지 크롬: `<main className="flex min-h-dvh flex-col gap-4 p-6 pb-28"> BottomTabBar + BackButton + FxDetailContent</main>` — `/index/[symbol]`와 동일(FR-014, SC-006).
- (선택) `@sheet/(.)fx/[code]` 바텀시트 변형: 본문은 `FxDetailContent` 공유(기존 index/cash 패턴 정합 시).

## FxDetailContent 표시 계약

표시 순서(상세 패턴 미러링):
1. **헤더**: 국기(`Flag code`) + `원/달러`(pairLabel) + code.
2. **현재 환율 카드**: `1 {code} = ₩{rate}` 큰 글씨 + 일간 변동(₩·%, 등락색은 시세 등락에만).
3. **추이 차트**: `PriceChart daily / monthly`(기존 컴포넌트 재사용). 데이터 없으면 "데이터 없음/재시도"(FR-015), 현재 환율은 유지.
4. **기간 고저**: 52주 최고/최저(일봉 파생).
5. 출처 주석: "야후 파이낸스 · 참고용"(기존 톤).

## 데이터 출처(신규 API 없음)

| 표시 | 함수 |
|------|------|
| rate | `getFxToKrw([code])` → `fx[code]` |
| daily | `getDailyKrwCloses(["{code}KRW=X"], oneYearAgo, today)` |
| monthly | `getDailyKrwCloses(["{code}KRW=X"], "1990-01-01", today, "1mo")` |
| changeAbs/Pct, high52/low52 | `daily` 시리즈에서 파생 |

- `{code}KRW=X`의 야후 통화=KRW → `getDailyKrwCloses` ₩환산 ×1 ⇒ 시리즈가 곧 환율값.

## 진입점

- `app/cash/page.tsx` 환율 탭(`:122-142`) 통화 행을 `<Link href="/fx/{c.code}">`로 감싼다(FR-012). KRW 행은 링크 없음.

## 불변식 / 헌장

- read-only(원장 불변, 헌장 V). 신규 외부 의존 없음(헌장 Additional Constraints).
- 라이트·모바일 단일, 카드+그림자 톤 유지(헌장 IV).

## 테스트 / 검증

- `/fx/USD` 진입 → 헤더·현재환율·차트 렌더, 뒤로가기로 `/cash?tab=fx` 복귀.
- `/fx/ZZZ` → 404.
- 차트 소스 실패 모의 시 현재 환율 유지 + 차트 자리 대체 문구.
