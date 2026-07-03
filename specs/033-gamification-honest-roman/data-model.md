# Phase 1 Data Model — 033 게이미피케이션 강화

## 1. DrawdownEpisode (계산 전용 — 저장 안 함)

`src/lib/finance/drawdown.ts`의 순수 엔진 출력. 원천(가치 시계열+events)에서 매번 재계산(FR-014).

| 필드 | 타입 | 의미 · 검증 규칙 |
|---|---|---|
| `peakDate` | string(YYYY-MM-DD) | 에피소드 직전 러닝 피크일 |
| `startDate` | string | 낙폭이 처음 −10%를 하회한 날. `startDate > peakDate` |
| `troughDate` | string | 최심 낙폭일. `peakDate < troughDate ≤ (recoveryDate ?? today)` |
| `depth` | number | 최심 낙폭(음수, 예 −0.234). `depth ≤ −0.10` (아니면 에피소드 아님) |
| `bucket` | 10\|20\|30\|40\|50 | `10×floor(|depth|×10)`, 50 상한 스냅 |
| `recoveryDate` | string \| null | 피크 회복일. null=미회복 진행 중 → 축하·연혁 대상 아님(FR-006) |
| `passed` | boolean | `recoveryDate ≠ null` **AND** `[peakDate, recoveryDate]`(양끝 포함)에 SELL 0건 |

**상태 전이**: (없음) → 진행 중(`recoveryDate=null`, 무표시) → 회복 → `passed=true`(축하+연혁) 또는 `passed=false`(무표시). 전이는 저장이 아니라 재계산 결과로 표현된다.

**입력 검증**: `value_{t-1} < 10,000`(1만원) 구간은 TWR 체인 미시작(0나눗셈·소액 왜곡 가드). events는 기존 `activeEventRows` 필터(소프트삭제·취소 제외)를 거친 것만 유입.

## 2. Milestone (기존 타입 — 항목 종류 추가)

`src/lib/finance/milestones.ts`의 기존 `Milestone { date, label }`에 새 생성원 3종이 합류(타입 변경 없음):

| 생성원 | date | label | 근거 FR |
|---|---|---|---|
| 드로다운 통과 | `recoveryDate` | `−{bucket}% 하락 구간을 매도 없이 통과` | FR-005 |
| 설립 N주년 | 각 기념일(지난 것 전부) | `설립 {N}주년` | FR-007 |
| 계획 완수 | `planCompletionDate(plan, events)` | `자본배분 계획 완수` | FR-008 |

병합: `/timeline`·`/growth` 페이지 레벨에서 기존 `data.timeline`과 merge 후 날짜 정렬(R7).

## 3. holdings.archived_plans (신규 컬럼 — 유일한 DB 변경)

```sql
-- supabase/migrations/<적용시점>_holdings_archived_plans.sql
alter table holdings
  add column if not exists archived_plans jsonb not null default '[]';
```

| 항목 | 값 |
|---|---|
| 내용 | 교체·삭제된 `RebalancePlan` 원문 배열(기존 `active_plan`과 동일 스키마의 JSON) |
| 쓰기 경로 | `rebalance/actions.ts`의 `saveRebalancePlan`·`clearRebalancePlan`이 덮어쓰기/삭제 **직전** append |
| 한도 | FIFO 20개 — 초과 시 가장 오래된 것 제거 |
| 검증 | append 전 `parsePlan` 성공한 것만(손상 JSON 보관 금지). 완수 여부·완수일은 **저장하지 않음**(events에서 재판정, 헌장 V) |
| RLS | holdings 행 자체의 기존 RLS(user_id 스코프)를 그대로 상속 — 신규 정책 불필요 |
| 타입 | `database.types.ts` 재생성(-o 옵션, PS 리다이렉트 금지 — 알려진 gotcha) |

**마이그레이션 순서**: default '[]' 포함 컬럼 추가라 기존 코드와 무충돌 — 코드 배포 전에 적용(헌장 워크플로 규칙).

## 4. StyleHistorySnapshot 확장 (기존 calculation_snapshots 재사용)

```ts
// src/lib/styleHistory.ts — VERSION = "v1" 유지 (하위호환 옵셔널 추가)
interface StyleHistorySnapshot {
  /* 기존 필드 불변 */
  score?: number;       // 규율 점수 0~100
  gradeLabel?: string;  // 등급 라벨 (style.ts gradeOf 결과)
}
```

| 항목 | 값 |
|---|---|
| 저장 경로 | 기존 `saveStyleSnapshot`(upsert, holding+as_of_date 키) — `/style` 방문 시 + **`/growth` 방문 시 추가 배선** |
| 조회 | 신설 `loadLatestStyleSnapshot(supabase, holdingId, before?)` — 최신 1건(커트라인 옵션) |
| 등급업 판정 | 최신 2건 비교: 둘 다 `gradeLabel` 존재 && `gradeRank(latest) > gradeRank(previous)` |
| 콜드스타트 | 과거 스냅샷에 `gradeLabel` 없음 → 비교 생략(FR-009 "기록 없으면 미생성") |

`gradeRank` 서열(`src/lib/style.ts` export): 과매매 주의(0) < 성장하는 투자가(1) < 규율 있는 장기투자가(2) < 자본배분의 달인(3).

## 5. Celebration 키 (기존 home_signal_dismissals 재사용 — 신규 저장 없음)

| 축하 | key | 노출 창 | 트리거 데이터 |
|---|---|---|---|
| 드로다운 통과 | `dd-pass:{recoveryDate}:{bucket}` | recoveryDate + 14일 | `drawdownPassages: {recoveryDate, bucket}[]` (passed만) |
| 등급업 | `grade-up:{quarterLabel}` | 분기 내 1회 | `gradeUp: { label }` |

key가 날짜·분기 스코프라 기존 디스미스 테이블의 자연 만료 규칙을 그대로 따른다. 문구 규칙: 행동만 언급, 시장 결과 언급 금지(FR-004·FR-012).
