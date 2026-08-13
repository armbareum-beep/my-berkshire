import { describe, expect, it } from "vitest";
import {
  isFlatFormat,
  readTargets,
  toStored,
  totalTarget,
  withTarget,
  type FlatTargets,
} from "./targetWeights";
import { flattenTargets } from "./allocate";

const SYMBOLS = [
  { symbol: "META", assetType: "주식" },
  { symbol: "PLTR", assetType: "주식" },
  { symbol: "VOO", assetType: "ETF" },
];

const CATEGORY = { "assetType:주식": 0.6, "assetType:ETF": 0.4 };

describe("isFlatFormat — 값의 타입으로 판별", () => {
  it("값이 객체면 평면", () => {
    expect(isFlatFormat({ META: { target: 0.15 } })).toBe(true);
  });

  it("값이 숫자면 레거시", () => {
    expect(isFlatFormat({ META: 0.4 })).toBe(false);
  });

  it("빈 객체·null 은 레거시로 본다 — 환산 경로가 안전하다", () => {
    expect(isFlatFormat({})).toBe(false);
    expect(isFlatFormat(null)).toBe(false);
    expect(isFlatFormat(undefined)).toBe(false);
  });
});

describe("readTargets — 레거시 2층", () => {
  it("유형 목표 × 유형 내 목표를 곱하고 정규화한다", () => {
    const t = readTargets({ META: 0.7, PLTR: 0.3, VOO: 1 }, CATEGORY, SYMBOLS);
    expect(t.META.target).toBeCloseTo(0.42);
    expect(t.PLTR.target).toBeCloseTo(0.18);
    expect(t.VOO.target).toBeCloseTo(0.4);
    expect(totalTarget(t)).toBeCloseTo(1);
  });

  it("기존 flattenTargets 와 같은 값을 낸다 — 배분 결과가 안 바뀐다", () => {
    const raw = { META: 0.7, PLTR: 0.3, VOO: 1 };
    const legacy = flattenTargets(SYMBOLS, CATEGORY, raw);
    const next = readTargets(raw, CATEGORY, SYMBOLS);
    for (const { symbol } of SYMBOLS) {
      expect(next[symbol].target).toBeCloseTo(legacy[symbol]);
    }
  });

  it("유형 목표를 절반만 채워둔 사용자도 정규화된다", () => {
    const t = readTargets(
      { META: 1, VOO: 1 },
      { "assetType:주식": 0.3, "assetType:ETF": 0.2 },
      [SYMBOLS[0], SYMBOLS[2]],
    );
    expect(t.META.target).toBeCloseTo(0.6);
    expect(t.VOO.target).toBeCloseTo(0.4);
  });

  it("목표가 0인 종목은 담지 않는다 — '설정 안 함'과 같게", () => {
    const t = readTargets({ META: 0.7, PLTR: 0 }, CATEGORY, SYMBOLS);
    expect(t.PLTR).toBeUndefined();
    expect(t.VOO).toBeUndefined(); // target_weights 에 없음
  });

  it("목표가 하나도 없으면 빈 맵 — NaN 을 만들지 않는다", () => {
    const t = readTargets({}, {}, SYMBOLS);
    expect(t).toEqual({});
    expect(totalTarget(t)).toBe(0);
  });
});

describe("readTargets — 평면", () => {
  it("저장된 값을 그대로 읽는다", () => {
    const t = readTargets({ META: { target: 0.15 }, PLTR: { target: 0.1 } }, {}, []);
    expect(t.META.target).toBeCloseTo(0.15);
    expect(t.PLTR.target).toBeCloseTo(0.1);
  });

  it("합이 1 미만이어도 부풀리지 않는다 — 나머지는 현금", () => {
    const t = readTargets({ META: { target: 0.15 }, PLTR: { target: 0.1 } }, {}, []);
    expect(totalTarget(t)).toBeCloseTo(0.25);
  });

  it("합이 1을 넘으면 1로 맞춘다 — 입력 실수 방어", () => {
    const t = readTargets({ A: { target: 0.8 }, B: { target: 0.8 } }, {}, []);
    expect(totalTarget(t)).toBeCloseTo(1);
    expect(t.A.target).toBeCloseTo(0.5);
  });

  it("캡 오버라이드를 보존한다", () => {
    const t = readTargets({ PLTR: { target: 0.1, hardCap: 0.14 } }, {}, []);
    expect(t.PLTR.hardCap).toBeCloseTo(0.14);
    expect(t.PLTR.softCap).toBeUndefined();
  });

  it("보유하지 않은 종목의 목표비중도 살아남는다 — 미보유 후보", () => {
    // symbols 목록에 없어도 평면 경로는 무시하지 않는다.
    const t = readTargets({ NVDA: { target: 0.2 } }, CATEGORY, SYMBOLS);
    expect(t.NVDA.target).toBeCloseTo(0.2);
  });

  it("망가진 행은 버리고 나머지는 살린다", () => {
    const t = readTargets(
      { A: { target: 0.2 }, B: { target: -1 }, C: { target: "x" }, D: {} },
      {},
      [],
    );
    expect(Object.keys(t)).toEqual(["A"]);
  });
});

describe("withTarget / toStored — 편집과 저장", () => {
  const base: FlatTargets = { META: { target: 0.15, hardCap: 0.2 } };

  it("한 종목만 바꾸고 캡 오버라이드는 유지한다", () => {
    const next = withTarget(base, "META", 0.2);
    expect(next.META.target).toBeCloseTo(0.2);
    expect(next.META.hardCap).toBeCloseTo(0.2);
  });

  it("새 종목을 추가한다", () => {
    const next = withTarget(base, "NVDA", 0.1);
    expect(next.NVDA.target).toBeCloseTo(0.1);
    expect(next.META).toBe(base.META); // 원본 규칙 객체를 재사용(불필요한 복사 없음)
  });

  it("0 이하는 종목을 뺀다 — '0%로 정함'과 '안 정함'을 구분하지 않는다", () => {
    expect(withTarget(base, "META", 0).META).toBeUndefined();
  });

  it("원본을 변경하지 않는다", () => {
    withTarget(base, "META", 0.9);
    expect(base.META.target).toBeCloseTo(0.15);
  });

  it("편집 중 합이 1을 넘어도 막지 않는다 — 저장은 되고 화면이 알려준다", () => {
    const next = withTarget({ A: { target: 0.8 } }, "B", 0.8);
    expect(totalTarget(next)).toBeCloseTo(1.6);
  });

  it("toStored 는 target 이 없는 종목을 버린다", () => {
    const stored = toStored({ A: { target: 0.2 }, B: { target: 0 } });
    expect(Object.keys(stored)).toEqual(["A"]);
  });

  it("저장 → 읽기 왕복이 값을 보존한다", () => {
    const map: FlatTargets = { META: { target: 0.15 }, PLTR: { target: 0.1, hardCap: 0.14 } };
    const back = readTargets(toStored(map), {}, []);
    expect(back).toEqual(map);
  });
});
