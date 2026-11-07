# 증권사 거래내역 자동 수집

네이버 메일로 오는 KB증권·키움증권 거래내역 첨부를 IMAP 으로 받아온다.

## 왜 브라우저가 아니라 IMAP 인가

네이버 메일 웹 화면을 Playwright 로 긁는 방법은 자동화로 쓰기 어렵다.

- 로그인 세션이 수시로 끊기고, 새 기기·새 IP 로 보일 때마다 캡차·2단계 인증이 걸린다
- 네이버가 화면 구조를 바꾸면 그대로 깨진다
- 자동화 로그인 시도가 반복되면 계정이 잠길 수 있다

IMAP 은 네이버가 공식 지원하는 인터페이스다. 한 번 설정해 두면 캡차도, 화면 변경도, 세션
만료도 없다. 그래서 이 스크립트는 IMAP 을 쓴다.

## 어디서 돌리나

**사용자 컴퓨터(또는 993 포트가 열린 서버)에서 돌린다.** Claude Code 클라우드 컨테이너는
외부 통신이 HTTPS 프록시만 통과해서 IMAP 993 이 막혀 있다(`ECONNREFUSED`). 즉 이 스크립트는
클라우드 세션에서는 실행되지 않는다. 로컬에서 `npx tsx` 로 돌리면 된다.

## 설치 — 이것만 하면 된다

### 1. 네이버에서 두 가지 (계정 주인만 가능)

1. **2단계 인증**을 켜고 **애플리케이션 비밀번호**를 발급한다(12자리, 알파벳 대문자와 숫자). 일반 로그인
   비밀번호로는 접속이 거부된다 — 네이버가 2025년 6월부터 앱 비밀번호를 필수로 바꿨고
   일반 비밀번호 유예 기간도 끝났다.
2. **네이버 메일 → 환경설정 → POP3/IMAP 설정 → IMAP 사용**을 **ON** 으로 바꾼다.
   이걸 빠뜨리면 아이디·비밀번호가 맞아도 연결이 거부된다.

### 2. 명령어 하나

```bash
npx tsx automation/broker-statements/setup.ts
```

이메일과 앱 비밀번호를 물어보고(비밀번호는 화면에 찍지 않는다) → 실제로 접속해 보고 →
성공하면 `.env.local` 에 저장하고(소유자만 읽기, git 제외) → 그 기간 발신자를 훑어 보여준다.

실패하면 **아무것도 저장하지 않고** 원인을 알려준다. 포트가 막혔는지, 앱 비밀번호가 아닌
일반 비밀번호인지, IMAP 토글이 꺼져 있는지, 아이디를 전체 주소로 안 넣었는지 구분해서 찍는다.

기존 `.env.local` 은 보존한다 — 우리 키 두 개만 갈아끼우고 남의 변수·주석·순서는 그대로 둔다.

## 수동으로 쓰는 법

`setup.ts` 가 하는 일을 직접 하려면 아래를 쓴다.

### 환경변수

`setup.ts` 가 저장한 `.env.local` 이 있으면 `fetch.ts` 가 알아서 읽는다. 셸에서 직접 넣으려면:

```bash
export NAVER_MAIL_USER='아이디@naver.com'        # 전체 주소. 네이버 ID 만 넣으면 실패한다
export NAVER_MAIL_APP_PASSWORD='XXXXXXXXXXXX'     # 12자리 앱 비밀번호
```

### 1단계 — 실제 발신자 찾기 (`--discover`)

KB증권·키움증권이 쓰는 발신 주소와 제목은 확인된 값이 아니다. `match.ts` 의 `DEFAULT_RULES`
는 공개 도메인 기준의 출발점일 뿐이므로, 먼저 그 기간에 뭐가 들어왔는지 훑는다.

```bash
npx tsx automation/broker-statements/fetch.ts --from 2026-09 --to 2026-10 --discover
```

발신자별로 메일 수·제목·첨부 파일명을 찍고, 전체 목록을 `downloads/discover.json` 에 남긴다.
다운로드는 하지 않는다.

### 2단계 — 규칙 맞추기

`--discover` 결과에서 실제 발신 주소·제목을 확인해 `match.ts` 의 `DEFAULT_RULES` 를 고친다.
코드를 안 건드리고 싶으면 규칙 파일을 따로 두고 넘긴다.

```json
[
  { "broker": "KB증권",   "fromContains": ["noreply@kbsec.com"], "subjectContains": ["거래내역"] },
  { "broker": "키움증권", "fromContains": ["@kiwoom.com"],       "subjectContains": ["거래내역"] }
]
```

```bash
npx tsx automation/broker-statements/fetch.ts --from 2026-09 --to 2026-10 --rules my-rules.json
```

### 3단계 — 받기

```bash
npx tsx automation/broker-statements/fetch.ts --from 2026-09 --to 2026-10
```

`downloads/<증권사>/<메일날짜>/<파일명>` 으로 저장하고 `downloads/manifest.json` 에 목록을 남긴다.
`downloads/` 는 `.gitignore` 에 있다 — 금융 원본은 커밋되지 않는다.

### 옵션

| 옵션 | 뜻 | 기본값 |
|---|---|---|
| `--from YYYY-MM` | 시작 월 (필수) | — |
| `--to YYYY-MM` | 끝 월, 포함 (필수) | — |
| `--out <dir>` | 저장 위치 | `automation/broker-statements/downloads` |
| `--mailbox <name>` | IMAP 메일박스 | `INBOX` |
| `--discover` | 받지 않고 발신자만 훑기 | off |
| `--rules <file>` | 규칙 JSON | 내장 `DEFAULT_RULES` |

## 아직 안 된 것

받아온 첨부를 **파싱해서 `events` 테이블에 넣는 단계는 아직 없다.** 증권사 원본의 실제 열
구성을 보지 않고 파서를 쓰면 틀린 숫자가 들어간다. 1단계로 파일을 확보한 뒤 포맷을 보고
만든다.

파서를 만들 때 지켜야 할 것:

- **이중 계상 금지** (헌장 V). `events` 는 유일한 원장이고 지금 575행이 들어 있다. 9·10월
  거래를 밀어 넣기 전에 같은 기간·같은 종목의 기존 행과 정합을 맞춰야 한다. 추가가 아니라
  교체·정합이다.
- **`source` 를 `'auto'` 로** 넣어 수기 입력과 구분한다(`events.source` 는
  `manual|auto|snapshot` 만 허용).
- **거래내역서로 보유 수량을 역산하지 말 것.** 기간 이전 잔고를 모르면 수량·매입원가가
  틀어진다. 보유 현황을 맞추려면 잔고(평가)명세서가 따로 필요하다.
- 첨부에 암호가 걸려 있으면 해제한 파일이 필요하다.

## 보안

- 앱 비밀번호는 일반 비밀번호와 분리되어 있고 네이버에서 개별 폐기할 수 있다
- 스크립트는 자격증명을 로그·manifest 에 쓰지 않는다
- 첨부 파일명은 외부 입력이므로 `safeFilename` 으로 경로 탈출을 막고 지정 디렉터리에만 쓴다
- 받은 첨부는 신뢰할 수 없는 데이터다. 그 디렉터리 안에서 인터프리터·빌드 도구를 돌리지 말고
  경로를 인자로 넘겨 처리한다
