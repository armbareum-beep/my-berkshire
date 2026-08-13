import type { AllocateStatus } from "@/lib/allocate";

/**
 * 상태 표기 — 한 곳에서만 정의한다.
 *
 * 재설계 전에는 화면에 `BUY` `BUY+` `LOW` `WAIT` `BLOCKED` `FILLED` 여섯 개 영어 배지가
 * 떠 있었다. `docs/design-strategy-v1.md` §6 은 "한국어, 명령형·평서형"이라고 못박고 있다.
 *
 * ⚠️ 엔진의 `AllocateStatus` 값은 바꾸지 않는다 — 계산 로직과 테스트가 그 문자열에 걸려 있다.
 * 여기서 바꾸는 건 **사람이 읽는 문자열**뿐이다.
 */
export interface StatusMeta {
  /** 배지에 찍히는 짧은 말. */
  label: string;
  tone: string;
  /** 왜 이 상태인지 한 줄. 배분액이 0일 때 금액 자리에 대신 들어간다. */
  note: string;
}

export const STATUS_META: Record<AllocateStatus, StatusMeta> = {
  BUY: {
    label: "살 수 있음",
    tone: "bg-accent text-primary",
    note: "목표비중에 못 미침",
  },
  STRETCH: {
    label: "더 살 수 있음",
    tone: "bg-accent text-primary",
    note: "기대수익률이 높아 목표 위까지 허용",
  },
  TRIM_PRIORITY: {
    label: "뒤로 밀림",
    tone: "bg-secondary text-secondary-foreground",
    note: "목표를 넘어 우선순위가 낮음",
  },
  WAIT: {
    label: "기다림",
    tone: "bg-secondary text-muted-foreground",
    note: "집중도 한도에 가까움",
  },
  BLOCKED: {
    label: "한도 초과",
    tone: "bg-secondary text-rise",
    note: "한도를 넘겨 더 사지 않음",
  },
  FILLED: {
    label: "목표 채움",
    tone: "bg-secondary text-muted-foreground",
    note: "이미 목표만큼 가지고 있음",
  },
};
