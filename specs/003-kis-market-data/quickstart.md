# Quickstart: KIS 시세·검색 연동 검증

## 사전조건
- `.env.local`에 `KIS_APP_KEY`·`KIS_APP_SECRET`·`KIS_BASE_URL`(실전 `https://openapi.koreainvestment.com:9443`) 설정(완료).
- 시장데이터는 **실전 도메인** 사용(모의는 해외 제한).

## 토큰 발급 확인 (구현 전 sanity)
```bash
curl -s -X POST "$KIS_BASE_URL/oauth2/tokenP" \
  -H "content-type: application/json" \
  -d '{"grant_type":"client_credentials","appkey":"'"$KIS_APP_KEY"'","appsecret":"'"$KIS_APP_SECRET"'"}'
# → access_token 포함(검증 완료). 분당 1회 제한이므로 재호출 주의.
```

## 단위 검증 (키 불필요)
```bash
npx vitest run src/lib/finance/kis/normalize.test.ts   # KIS fixture → 내부 타입
```

## 통합 검증 (FINANCE_SOURCE=kis)
1. `.env.local`에 `FINANCE_SOURCE=kis` 추가 후 `npm run dev`.
2. **한글검색(US1/SC-001)**: 검색창 "삼성전자" → 005930 결과 확인.
3. **국내 시세(US2/SC-002)**: `/api/quote?symbols=005930` → `stck_prpr` 값과 일치.
4. **해외 시세+환율**: `/api/quote?symbols=AAPL` → `last`(USD)·`t_rate` 환산 ₩ 확인.
5. **과거차트**: 종목 상세 005930 연말종가 추이 렌더.

## 회귀 검증 (SC-003/005)
1. `FINANCE_SOURCE` 제거(기본 yahoo) → 기존 동작 동일.
2. 펀더멘털·배당·ETF/지수 화면(야후/DART/EDGAR/KRX) 변화 없음.

## 품질 게이트 (헌법)
```bash
npx tsc --noEmit && npx eslint src/lib/finance/kis src/lib/finance/source.ts
```
