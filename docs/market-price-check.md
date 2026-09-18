# 기존 시세 연결 점검

기본 `FINANCE_SOURCE=yahoo` 경로는 API 키나 고정 출발 IP 설정 없이 Yahoo에 조회한다.
국내 6자리 종목코드는 `.KS`와 `.KQ`를 조회하여 체결 시각이 더 최근인 유효한 응답을 사용한다.

앱과 동일한 현재가·환율 함수를 DB 접속 없이 실행:

```sh
npm ci
npm run check:prices -- 069500 AAPL
```

`.env.local` 등 Next.js 환경설정을 읽는다. Yahoo만 점검하려면 macOS/Linux에서
`FINANCE_SOURCE=yahoo npm run check:prices -- 069500 AAPL`을 사용한다.

- `prices`, `previousCloses`: 원화 환산 가격. `currencies`: 원래 거래 통화.
- `checkedAt`: 조회 완료 시각. 시세 체결 시각이 아니며 지연 없는 실시간 가격을 보장하지 않는다.
- `configuredSource`: 설정한 소스. 다른 소스에서 Yahoo로 대체 조회한 경우까지 식별하지는 않는다.
- `missingSymbols`: 가격 또는 필요한 환율을 못 받은 종목. 하나라도 있으면 종료 코드 1.
- `available`: 가격을 하나 이상 확보했는지 여부. 일부 누락은 반드시 `missingSymbols`로 확인한다.

Yahoo 현재가는 최대 20초, 환율은 최대 10초 대기하고, 오류나 유효하지 않은 숫자는 누락 처리한다.
통화가 없는 시세도 원화로 임의 해석하지 않는다. 가격 단계와 환율 단계는 순차 실행되므로
전체 대기 시간은 약 30초까지 걸릴 수 있다.

로컬 조회 성공만으로 Vercel에서의 성공을 보장할 수 없다. 적용 후 로그인한 앱에서
가격과 조회 실패 표시를 확인해야 한다. 공급자 지연·호출 제한·지원 종목 차이도 가능하다.
이 기능은 시장 가격 조회이며 퇴직연금 계좌의 보유 수량이나 입출금 내역을 가져오지는 않는다.
