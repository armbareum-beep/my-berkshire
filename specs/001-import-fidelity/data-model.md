# Phase 1 Data Model — 거래내역 정밀도 복원

## 엔티티

### events (거래 원장 — 기존)
| 필드 | 의미 | 비고 |
|---|---|---|
| type | BUY/SELL/DIVIDEND/DEPOSIT/WITHDRAWAL/EXCHANGE | |
| symbol | 종목코드(거래성) | 현금흐름은 null |
| quantity | 수량 | BUY/SELL만 |
| price_or_amount | ₩ 환산 단가/금액 | 기능통화 KRW |
| date | 거래일 YYYY-MM-DD | |
| **source** | `'manual' \| 'auto' \| 'snapshot'` | **'snapshot' 신규 허용**(CHECK 완화) |
| deleted_at | 소프트 삭제 | 정합 교체 시 스냅샷에 set |

### holdings (회사 — 기존 + 신규 컬럼)
| 필드 | 의미 | 비고 |
|---|---|---|
| founded_at | 설립일 = 가장 이른 기록 | **뒤로만 이동** |
| completed_years | 연도별 완료 표시 | 기존 |
| **founding_declared** | 설립 확정 여부 boolean | **신규**, default false |

### 파생: 종목 정밀도 상태(티어) — 저장 안 함, 계산
- `H[sym]` 보유 = `portfolio.positions[sym]` (활성 순수량).
- `realNet[sym]` = `source!=="snapshot"` 활성 BUY−SELL.
- `snapshotPresent[sym]` = `source==="snapshot"` 활성 BUY 존재.
- **티어**:
  - **T0 스냅샷**: `snapshotPresent`(스냅샷 BUY가 살아있음). 목표 수량 = 스냅샷 수량(snapshotQty).
  - **T1 복원·정합**: `!snapshotPresent && H>0`(스냅샷이 실제 기록으로 교체됨). 목표 = H.
  - **T2 매도완료**: `!snapshotPresent && H==0`(미보유 왕복).

> **중요(구현 시 확정)**: 스냅샷 BUY 가 살아있는 동안 전체 순수량(held)=스냅샷+실제라 **`realNet===held`로 비교하면 절대 일치 불가**. 비교 기준은 **실제 입력 순수량 === 스냅샷 수량(snapshotQty=목표)**.
> 또한 일시적 이중 계상을 막기 위해 **실제 매매는 화면(클라이언트)에만 모았다가 "복원 완료" 한 번에 저장+스냅샷 삭제**한다(스테이징식). 수량이 같아도 **평단가는 실제 기록으로 교체**되어 정확해진다.

## 불변식 (검증 가능)
1. **정합 교체**: `reconstructPosition`은 입력 거래의 순수량 `=== snapshotQty`(+ 날짜순 음수 보유 없음)일 때만, 모아온 실제 거래를 저장하고 스냅샷 BUY+짝 DEPOSIT을 삭제. 그 외 거부(저장 안 함).
2. **현금 중립**: 스냅샷 BUY+짝 DEPOSIT 함께 삭제. 실제 매수는 매수일에 자체 DEPOSIT 동반(설립 모델) → 현금 일관.
3. **founded_at 단조 후퇴**: 입력 거래 최소일 `< founded_at`이면 갱신(설립 확정도 해제), 앞으로는 이동 안 함.
4. **보유 수량 보존, 이중계상 0**: 교체 전후 보유 수량 불변. 저장은 단일 커밋이라 중간 이중계상 렌더 없음.
5. **정직 미터**: `trust = |{sym: T1}| / |{sym: 표시된 종목}|`; 스냅샷 0이면(레거시) fallback.

## 상태 전이
```
T0(스냅샷) ──화면 카트에 실제 매매 입력(저장 안 함)──▶ [순수량==스냅샷] ──복원 완료(일괄 저장+스냅샷 삭제)──▶ T1(복원완료)
                                                    └ [불일치] ──▶ 버튼 비활성(저장 안 함)

founding_declared: false ──"첫 거래 선언"──▶ true(봉인, 미터 100%)
                     ▲                              │
                     └──── 더 이른 거래 입력(자동 해제) ──┘  (+ founded_at 후퇴)

미보유 종목 ──왕복 입력(net 0)──▶ T2 ──▶ 실현손익 잠금 해제
```

## 잠금 게이트
- T1 지표 프리뷰(누적·XIRR): `portfolio.result.status !== "price_unavailable"`(엔진 90일 규칙은 XIRR에 내장).
- T2 실현손익: 매도완료 종목 ≥1.
- 100%(완료): `founding_declared === true`.
- 잠금 상태 표시: 가짜 수치 금지(`blur-sm` + 가림 + 해제 조건 안내).
