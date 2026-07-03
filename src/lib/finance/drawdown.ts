/**
 * 드로다운 인내 엔진 — 헌법 §2·§4 유일한 예외 축하("낙폭"이 아니라 "안 판 결정").
 *
 * 흐름조정 TWR(Time-Weighted Return) 체인 — design-notes.md 기능1:
 *   f_t = invested_t − invested_{t-1}                       (그날의 순자본흐름)
 *   r_t = (value_t − f_t − value_{t-1}) / value_{t-1}        (흐름 제거한 순수 수익률)
 *   index_t = index_{t-1} × (1 + r_t),  index_0 = 1
 * 증자·인출은 invested 에만 반영되고 value 변동에서 상쇄되어, "돈을 빼서 평가액이
 * 줄어든 것"이 가짜 드로다운으로 잡히지 않는다.
 *
 * 러닝 피크 peak_t = max(index_0..t), drawdown_t = index_t/peak_t − 1.
 * −10% 하회 시작 ~ 피크 재회복까지를 한 에피소드로 판정한다. 순수함수 — 저장 없음(FR-014,
 * 매 호출 결정적 재계산). 화면은 loadDrawdownEpisodes(로더)를 통해 이 함수를 호출만 한다.
 */
import type { ValuePoint } from "./valueSeries";
import type { InvestmentEvent } from "./valuation";

export interface DrawdownEpisode {
  peakDate: string;
  startDate: string;
  troughDate: string;
  depth: number; // 음수, 예: -0.234
  bucket: number; // 10|20|30|40|50 (50 상한 스냅)
  recoveryDate: string | null; // 미회복이면 null — 축하·연혁 대상 아님
  passed: boolean; // recoveryDate≠null && [peakDate,recoveryDate](양끝 포함) SELL 0건
}

/** 부동소수 누적곱 오차 가드(회복 판정 시 "같음"도 회복으로 인정). */
const EPS = 1e-9;

interface OpenEpisode {
  peakDate: string;
  startDate: string;
  troughDate: string;
  depth: number;
}

/** 창 [peakDate, recoveryDate](양끝 포함) 안에 SELL 이 하나라도 있으면 "통과" 실격. */
function finalize(
  ep: OpenEpisode,
  recoveryDate: string | null,
  events: InvestmentEvent[],
): DrawdownEpisode {
  // 부동소수 오차(예: 0.8-1 = -0.19999999999999996) 로 floor 가 한 단계 낮게
  // 스냅되지 않도록 미세 보정 후 버킷화.
  const bucket = Math.min(50, 10 * Math.floor(Math.abs(ep.depth) * 10 + EPS));
  const passed =
    recoveryDate !== null &&
    !events.some(
      (e) => e.type === "SELL" && e.date >= ep.peakDate && e.date <= recoveryDate,
    );
  return { ...ep, bucket, recoveryDate, passed };
}

/**
 * −10% 이상 하락→회복 구간(에피소드)을 전부 판정한다.
 * @param points 풀해상도 ValuePoint[](다운샘플 없이) — 날짜 오름차순 가정.
 * @param events SELL 판정용(activeEventRows 필터를 이미 거친 것).
 * @param minBalance 이 미만 잔고 구간은 체인 미시작(0나눗셈·소액 왜곡 가드).
 */
export function computeDrawdownEpisodes(
  points: ValuePoint[],
  events: InvestmentEvent[],
  minBalance = 10_000,
): DrawdownEpisode[] {
  if (points.length < 2) return [];

  const episodes: DrawdownEpisode[] = [];

  let chainStarted = false;
  let index = 1;
  let peak = 1;
  let peakDate = "";
  let current: OpenEpisode | null = null;

  for (let t = 1; t < points.length; t++) {
    const prev = points[t - 1];
    const cur = points[t];

    if (!chainStarted) {
      if (prev.value < minBalance) continue; // 소액 구간 — 체인 미시작
      chainStarted = true;
      index = 1;
      peak = 1;
      peakDate = prev.date;
    }

    if (prev.value <= 0) continue; // 이론상 도달 안 하지만 0나눗셈 방어

    const flow = cur.invested - prev.invested;
    const r = (cur.value - flow - prev.value) / prev.value;
    index = index * (1 + r);

    if (index >= peak - EPS) {
      // 신규 피크 또는 회복 — 진행 중 에피소드가 있으면 여기서 통과 확정.
      if (current) {
        episodes.push(finalize(current, cur.date, events));
        current = null;
      }
      peak = index;
      peakDate = cur.date;
      continue;
    }

    const drawdown = index / peak - 1;
    if (drawdown <= -0.1) {
      if (!current) {
        current = {
          peakDate,
          startDate: cur.date,
          troughDate: cur.date,
          depth: drawdown,
        };
      } else if (drawdown < current.depth) {
        current.troughDate = cur.date;
        current.depth = drawdown;
      }
    }
  }

  // 시리즈 끝까지 회복 못 한 진행 중 에피소드 — recoveryDate=null(축하·연혁 대상 아님).
  if (current) episodes.push(finalize(current, null, events));

  return episodes;
}
