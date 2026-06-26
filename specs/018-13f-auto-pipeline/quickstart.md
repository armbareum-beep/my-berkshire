# Quickstart: 거장 13F 자동 파이프

**Branch**: `018-13f-auto-pipeline`

## 사전 조건

- `npm run dev` 실행 중
- Supabase 마이그레이션 적용 완료 (`supabase db push`)
- `.env.local`에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 설정

## US1 검증 — 자동 수집으로 최신 분기 데이터

```bash
# 1. 수동 sync 실행
npm run sync:13f

# 기대 출력:
# [buffett] 2025 Q1 → 44 holdings synced
# [ark] 2025 Q1 → 31 holdings synced
# [ackman] 2025 Q1 → 7 holdings synced

# 2. 앱에서 확인
# /allocation → 거장 포트폴리오 섹션
# 거장 아바타 클릭 → 기준일 "2025 Q1 · filed YYYY-MM-DD" 표시 확인
# 보유 목록이 정적 데이터와 다른지(최신 13F 반영) 확인
```

**통과 기준**: 기준일이 직전 분기 이내, 종목 수가 정적 데이터보다 최신 13F와 일치.

---

## US2 검증 — 분기 변화(신규/추가/축소/청산) 표시

```bash
# sync:13f를 두 번 실행 (두 번째는 직전 분기 데이터 있음) 또는
# 테스트 픽스처로 이전 분기 데이터 삽입 후 확인
```

1. `/allocation` → 거장 선택 → **매수** 탭: 신규(`new`)·추가(`added`) 종목 표시 확인
2. **매도** 탭: 축소(`reduced`)·청산(`exited`) 종목 표시 확인
3. 전 분기 데이터 없는 상태 → "이전 분기 데이터 없음" 안내 확인

**통과 기준**: 신규·추가·축소·청산이 각각 올바른 탭에 표시됨.

---

## US3 검증 — 여러 거장 전환 + 업데이트 날짜

1. 거장 아바타(버핏·캐시우드·액만) 전환 → 각각 다른 기준일 표시 확인
2. 특정 거장 sync 실패 시나리오:
   - `legend_registry`에서 CIK를 잘못된 값으로 임시 수정 후 sync
   - 해당 거장 선택 시 "업데이트 실패" 안내 + 이전 데이터 표시 확인

---

## 회귀 검증

- `내 보유` 배지: 내가 보유한 종목이 거장 목록에 있을 때 배지 표시 유지
- 도넛 차트: 렌더 정상 (상위 8개 + 기타)
- `/allocation` 기존 탭(유형/국가/산업) 정상 동작
- `npx tsc --noEmit` 클린
