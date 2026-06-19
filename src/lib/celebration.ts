/**
 * 축하 정책 — 게이미피케이션의 "헌법"(③ 정직한 축하).
 *
 * 원칙: **결정·규율만 축하한다. 시장 결과는 절대 축하하지 않는다.**
 *   시장은 통제 불가 → 운빨을 실력처럼 보이게 하면 거짓이고, 거짓 축하는 신뢰를 무너뜨린다.
 *   (김형태: "못하고 있는데 잘하는 것처럼 보이면 큰 문제다.")
 *
 * 출력은 새 UI/엔진 없이 기존 홈 신호 큐(HomeSignal, tone:"good")에 한 건씩 태운다.
 * 디스미스도 기존 home_signal_dismissals 인프라를 그대로 쓴다(key 자연 만료).
 *
 * 상세·근거·로드맵 매핑: docs/gamification-honest-roman-v1.md §2, §6.
 */
import { byRecency, type HomeSignal } from "./finance/homeSignal";
import { daysSince } from "./finance/xirr";

/**
 * ❌ 축하 금지 목록(통제 불가·거짓 위험) — 미래 게이미피케이션 요소가 어겼는지 점검하는 기준선.
 * 이 목록의 어떤 것도 축하 트리거가 되어선 안 된다.
 */
export const CELEBRATION_DENYLIST = [
  "valuationUp", // 평가액 상승(시장발)
  "greenDay", // 초록색 하루(dailyChange > 0)
  "xirrValue", // XIRR 숫자 자체(운+실력 혼재)
  "symbolSpike", // 단일 종목 급등
] as const;

/** 설립 기념일 축하 노출 창(주년 당일부터 N일). */
const ANNIVERSARY_WINDOW_DAYS = 14;

export interface CelebrationOpts {
  holdingName: string;
  /** 설립일(YYYY-MM-DD). */
  foundedAt: string;
  today: string;
  /** 자본배분 계획 완수 여부 + 계획 식별자(createdAt). 계획 없으면 null. */
  plan: { complete: boolean; createdAt: string } | null;
  /** 확인(디스미스)된 신호 key — resolveHomeSignals 와 동일 집합. */
  dismissed: Set<string>;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * 가장 최근에 지난 설립 기념일과 경과 연수. 아직 1주년 전이면 null.
 * 문자열 YYYY-MM-DD 비교는 사전식으로 안전.
 */
function anniversary(
  foundedAt: string,
  today: string,
): { years: number; date: string } | null {
  const [fy, fm, fd] = foundedAt.split("-").map(Number);
  const ty = Number(today.slice(0, 4));
  const md = `${pad(fm)}-${pad(fd)}`;
  // 올해 기념일이 이미 지났으면 올해, 아직이면 작년 기념일이 직전.
  const annivYear = today >= `${ty}-${md}` ? ty : ty - 1;
  const years = annivYear - fy;
  if (years < 1) return null;
  return { years, date: `${annivYear}-${md}` };
}

/**
 * 정직하게 축하할 만한 일들 → HomeSignal[](tone:"good").
 * 결정·규율·시간만 축하(통제 가능). 시장 결과(CELEBRATION_DENYLIST)는 여기서 절대 만들지 않는다.
 *
 * 현재 트리거(추가 인프라 0):
 *  · 설립 N주년 — 시간·꾸준함(통제 가능). "버틴 것"을 축하(인내 프레이밍).
 *  · 자본배분 계획 완수 — 규율 이행(통제 가능).
 * (드로다운 통과·규율 등급업 등은 연혁/이력 인프라가 생기면 추가 — 스펙 §6.)
 */
export function computeCelebrations(opts: CelebrationOpts): HomeSignal[] {
  const out: HomeSignal[] = [];

  // 1) 설립 기념일 — 주년 당일부터 창 안에서만, 1주년부터.
  const anniv = anniversary(opts.foundedAt, opts.today);
  if (anniv) {
    const ago = daysSince(anniv.date, opts.today);
    if (ago >= 0 && ago <= ANNIVERSARY_WINDOW_DAYS) {
      out.push({
        key: `anniv:${anniv.years}`, // 연 1회, 다음 해는 새 key 라 자연 만료
        icon: "🏛️",
        text: `${opts.holdingName} 설립 ${anniv.years}주년 — 한 해를 버텨냈습니다`,
        href: "/activity",
        tone: "good",
        at: anniv.date,
      });
    }
  }

  // 2) 자본배분 계획 완수 — 내 계획을 끝까지 체결한 규율.
  if (opts.plan?.complete) {
    out.push({
      key: `plan-done:${opts.plan.createdAt}`, // 계획별 1회, 새 계획(새 createdAt)이면 다시 축하
      icon: "✅",
      text: "자본배분 계획을 끝까지 체결했어요",
      href: "/rebalance",
      tone: "good",
      at: opts.plan.createdAt,
    });
  }

  // 디스미스 제외(resolveHomeSignals 와 동일 규칙).
  return out.filter((c) => !opts.dismissed.has(c.key));
}

/**
 * 축하를 기존 신호 배열에 합쳐 **최신순**으로 정렬한다(at 내림차순).
 * 갓 생긴 축하(기념일·계획 완수일)가 오래된 뉴스 위로 자연히 떠오른다.
 * 배너는 [0]부터 한 건씩 노출.
 */
export function mergeCelebrations(
  signals: HomeSignal[],
  celebrations: HomeSignal[],
): HomeSignal[] {
  return [...signals, ...celebrations].sort(byRecency);
}
