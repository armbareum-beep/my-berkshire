# Phase 1 Data Model: 복리 무중단 지표

저장하지 않는 **파생 모델**이다. 새 테이블·컬럼 없음. 전부 `events`에서 계산.

## Input: 자본 흐름 (Capital Flow)

기존 `events`에서 추출. (참조: `EventType` @ `src/lib/finance/valuation.ts:10-16`)

| 이벤트 타입 | 자본 흐름으로 취급? | 무중단 영향 |
|-------------|---------------------|-------------|
| `DEPOSIT`   | 유입(+)             | 무중단 시작/이어감, 최근이면 🔥 보너스 |
| `WITHDRAWAL`| 유출(−, 소비)       | **끊김** (그 시점에서 리셋) |
| `DIVIDEND`  | 아님                | 영향 없음 |
| `BUY`/`SELL`| 아님(기계 내 이동)  | 영향 없음 |
| `EXCHANGE`  | 아님(통화 환전)     | 영향 없음 |

> 날짜 기준: 각 이벤트의 거래일(`date`, `YYYY-MM-DD`). "오늘"은 `todayKST()`.

## Computed: 복리 무중단 상태 (CompoundingStreak)

```text
CompoundingStreak {
  startDate: string | null     # 무중단 시작일(YYYY-MM-DD). 최초 자본 투입일 또는 마지막 끊김일. 빈 장부면 null
  days: number                 # startDate ~ today 경과 일수 (>=0)
  months: number               # 표시용 개월 수 (days 기반 환산)
  unit: 'day' | 'month'        # 1개월 미만이면 'day', 아니면 'month'
  bonusRecentDeposit: boolean  # 최근 N일 내 DEPOSIT 존재 → 🔥
  breaks: Array<{ date: string }>   # (상세용) 과거 끊김 시점들. 결산에서 노출
  deposits: Array<{ date: string }> # (상세용) 추가 투입 이력. 결산에서 노출
  isEmpty: boolean             # 자본 투입 전 빈 장부 → 중립 빈 상태
}
```

### 계산 규칙 (결정적)

1. 자본 흐름 이벤트(DEPOSIT/WITHDRAWAL)만 날짜 오름차순 정렬.
2. 흐름이 하나도 없으면 → `isEmpty = true`, 나머지 null/0.
3. `startDate` = 마지막 WITHDRAWAL(끊김) 날짜. 끊김이 없으면 첫 DEPOSIT(=최초 자본 투입일) 날짜.
   - 같은 날 투입+인출이 섞이면 그날의 **자본 순흐름**이 음수일 때만 끊김으로 본다(Edge Case).
4. `days` = `dateDiffDays(startDate, todayKST())` (음수 방지, 최소 0).
5. `unit`/`months` = days < 31 이면 `unit='day'`; 아니면 `unit='month'`, `months = floor(days / 30.44)` (또는 달력 기반 개월 차 — 구현 시 헬퍼로 통일).
6. `bonusRecentDeposit` = 최근 30일 내 DEPOSIT 존재 여부.
7. `breaks`/`deposits` = 상세 노출용 이력(결산에서만 사용).

### 불변식 / 검증 규칙

- `days >= 0` 항상. 미래 날짜 이벤트는 today로 클램프.
- `cashWeight`·시세는 입력에 **포함되지 않는다**(FR-010 — 결과가 시장·현금에 불변).
- 외화 흐름은 기존 ₩환산 값을 사용(별도 환산 로직 추가 없음).
- 같은 입력 → 항상 같은 출력(순수 함수, 결정적).

## Output 연결 지점

- **대시보드**: `DashboardData`(`src/lib/dashboard.ts:43-61`)에 `compoundingStreak: CompoundingStreak` 필드 추가 → `HeroValuationCard`(`cards.tsx:104-219`)에서 한 줄 표시(`startDate`,`days`,`unit`,`months`,`bonusRecentDeposit`).
- **결산**: `QuarterReportView`(`src/components/report/QuarterReportView.tsx`)에서 `breaks`/`deposits`/`startDate` 상세 표시.
