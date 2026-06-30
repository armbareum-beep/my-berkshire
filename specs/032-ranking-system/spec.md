# 032 — 멀티유저 랭킹 시스템

## 목표

조작하기 어려운 5가지 투자 규율 지표로 점수를 산출하고, 전체 유저 리더보드를 보여주는 `/ranking` 페이지를 신설. 하단 탭바를 5탭으로 확장.

---

## 구현 범위

### 하단 탭바 변경
`BottomTabBar.tsx` — 4탭 → 5탭  
`홈 | 검색 | +(action) | 랭킹 | 마이버크셔`  
랭킹 아이콘: lucide `Trophy`

### DB — `ranking_scores` 테이블
| 컬럼 | 타입 | 설명 |
|------|------|------|
| `holding_id` | UUID PK | holdings FK |
| `holding_name` | TEXT | 표시용 지주회사명 |
| `total_score` | INTEGER | 0~100 총점 |
| `holding_period_score` | INTEGER | 지표별 점수 |
| `contrarian_score` | INTEGER | |
| `market_score` | INTEGER | |
| `diversification_score` | INTEGER | |
| `deposit_score` | INTEGER | |
| `computed_at` | TIMESTAMPTZ | 마지막 계산 시각 |

RLS: 인증 유저 전체 SELECT, 본인 holding만 INSERT/UPDATE

### 점수 엔진 — `src/lib/ranking.ts`

| 지표 | 가중치 | 산식 |
|------|--------|------|
| 보유기간 가중 수익률 | 30% | FIFO lot별 `return_rate × log(1 + days/30)` 원가 가중 평균 → [-1,1] → [0,100] |
| 역발상 매수율 | 25% | 기존 보유 종목 추가매수 시 평균단가 아래에서 산 비율 |
| 시장 대비 성과 | 20% | 내 XIRR - 코스피 PME XIRR. ±10%p 범위 → [0,100] |
| 분산도 일관성 | 15% | 매 거래 시점 HHI 시간평균의 역수 → `(1 - avg_hhi) × 100` |
| 적립 일관성 | 10% | DEPOSIT 있는 달 / 설립~오늘 총 달수 |

등급: S(90+) / A+(80+) / A(70+) / B+(60+) / B(50+) / C

### `/ranking` 페이지 흐름
1. `getPortfolio()` → events, prices, result
2. `computeBenchmark()` → 코스피 XIRR
3. `computeRankingScore()` → RankingScore
4. `supabase.from("ranking_scores").upsert(...)` — 현재 유저 점수 갱신
5. 전체 `ranking_scores` 조회 (total_score DESC)
6. `<Leaderboard>` + `<ScoreCard>` 렌더

### 신규 컴포넌트
- `src/components/ranking/Leaderboard.tsx` — 순위·이름·점수, 1~3위 메달, "나" 배지
- `src/components/ranking/ScoreCard.tsx` — 총점 + 등급 + 5개 지표 상세
- `src/components/ranking/MetricRow.tsx` — 지표별 점수 바

---

## 제약 및 설계 결정

- **과거 시세 불필요** — 모든 계산은 `events` + 현재가(KRW)만 사용
- **참여 시점** — `/ranking` 방문 시 upsert (추후 `/dashboard` 방문 시 백그라운드 upsert로 확장 예정)
- **스타일 중립** — 거래 스타일(가치/성장)이 아닌 행동 규율(보유기간·역발상·분산·적립)만 측정
- **데이터 부족 처리** — 추가매수 없음·운용 90일 미만 등은 해당 지표 "데이터 부족" 표시

---

## 파일 목록

| 파일 | 변경 |
|------|------|
| `supabase/migrations/20260630000000_ranking_scores.sql` | 신규 |
| `src/lib/ranking.ts` | 신규 |
| `src/app/ranking/page.tsx` | 신규 |
| `src/components/ranking/Leaderboard.tsx` | 신규 |
| `src/components/ranking/ScoreCard.tsx` | 신규 |
| `src/components/ranking/MetricRow.tsx` | 신규 |
| `src/components/dashboard/BottomTabBar.tsx` | 수정 |
| `src/lib/supabase/database.types.ts` | 재생성 |
