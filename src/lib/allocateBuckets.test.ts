import { describe, expect, it } from "vitest";
import {
  buildBuckets,
  buildSubBuckets,
  subLensOf,
} from "./allocateBuckets";
import { rankRows } from "./allocateRanking";
import type { AllocateRow } from "./allocateData";

function row(
  symbol: string,
  value: number,
  target: number,
  extra: Partial<AllocateRow> = {},
): AllocateRow {
  return {
    key: symbol,
    symbol,
    label: symbol,
    value,
    target,
    held: value > 0,
    price: 100,
    assetType: "주식",
    country: "미국",
    sector: "반도체",
    ...extra,
  };
}

const labels = (bs: ReturnType<typeof buildBuckets>) => bs.map((b) => b.label);

describe("buildBuckets — 돈을 받을 묶음", () => {
  it("유형 렌즈는 실제 자산유형대로 가른다", () => {
    const buckets = buildBuckets(
      rankRows([
        row("META", 100, 0.3),
        row("SPY", 100, 0.3, { assetType: "ETF" }),
        row("BTC", 100, 0.1, { assetType: "코인" }),
      ]),
      "assetType",
    );
    expect([...labels(buckets)].sort()).toEqual(["ETF", "주식", "코인"].sort());
  });

  it("국가 렌즈는 유형을 가로질러 묶는다", () => {
    const buckets = buildBuckets(
      rankRows([
        row("META", 100, 0.2),
        row("SPY", 100, 0.2, { assetType: "ETF" }),
        row("005930", 100, 0.2, { country: "한국" }),
      ]),
      "country",
    );
    const us = buckets.find((b) => b.label === "미국")!;
    // 미국 주식 + 미국 ETF 가 한 묶음이다.
    expect(us.members.sort()).toEqual(["META", "SPY"]);
    expect(buckets.find((b) => b.label === "한국")!.members).toEqual(["005930"]);
  });

  it("한 묶음 안에서 주식과 ETF 를 섹션으로 갈라 각자 1번부터 센다", () => {
    const buckets = buildBuckets(
      rankRows([
        row("META", 100, 0.3),
        row("SPY", 100, 0.3, { assetType: "ETF" }),
      ]),
      "country",
    );
    const us = buckets.find((b) => b.label === "미국")!;
    expect(us.sections.map((s) => s.key)).toEqual(["stocks", "others"]);
    expect(us.sections[0].basis).toBe("기대수익률 순");
    expect(us.sections[1].basis).toBe("목표 미달 순");
    // 각 섹션이 자기 목록을 갖는다 — 번호는 화면이 섹션 안에서 1부터 매긴다.
    expect(us.sections[0].rows.map((r) => r.row.symbol)).toEqual(["META"]);
    expect(us.sections[1].rows.map((r) => r.row.symbol)).toEqual(["SPY"]);
  });

  it("유형 렌즈에서는 섹션이 늘 하나뿐이다", () => {
    const buckets = buildBuckets(
      rankRows([row("META", 100, 0.3), row("NVDA", 100, 0.3)]),
      "assetType",
    );
    expect(buckets[0].sections).toHaveLength(1);
  });

  it("모자란 묶음이 먼저 — 어디에 넣을지가 곧 목록 순서다", () => {
    // 총 1000. 한국은 목표 60%인데 10%, 미국은 목표 20%에 이미 30%.
    const buckets = buildBuckets(
      rankRows([
        row("META", 300, 0.2),
        row("005930", 100, 0.6, { country: "한국" }),
        row("CASHLIKE", 600, 0.1, { country: "일본" }),
      ]),
      "country",
    );
    expect(labels(buckets)[0]).toBe("한국");
  });

  it("태그가 없어 모인 묶음은 맨 아래로 내린다", () => {
    const buckets = buildBuckets(
      rankRows([
        // 미분류가 미달이 더 커도 아래로 간다 — 구성이 유동적이라 고르기 나쁘다.
        row("X", 0, 0.6, { sector: "미분류" }),
        row("NVDA", 100, 0.2),
      ]),
      "sector",
    );
    expect(labels(buckets).at(-1)).toBe("미분류");
  });

  it("대표 종목은 살 수 있는 것 중 첫째다", () => {
    // A 는 hard cap 초과로 차단, B 는 살 수 있음.
    const buckets = buildBuckets(
      rankRows([row("A", 300, 0.1), row("B", 200, 0.6)]),
      "country",
    );
    expect(buckets[0].top!.row.symbol).toBe("B");
  });

  it("members 가 eligible 판정에 그대로 쓰인다 — 순서는 섹션 순", () => {
    const buckets = buildBuckets(
      rankRows([
        row("SPY", 100, 0.3, { assetType: "ETF" }),
        row("META", 100, 0.3),
      ]),
      "country",
    );
    // 주식 섹션이 먼저이므로 META 가 앞이다.
    expect(buckets[0].members).toEqual(["META", "SPY"]);
  });

  it("빈 목록이면 묶음도 없다", () => {
    expect(buildBuckets([], "country")).toEqual([]);
  });
});

describe("buildSubBuckets — 묶음 안을 다른 축으로 다시 묶는다", () => {
  // 주식: META(미국) · 삼성(한국)   ETF: SPY(미국)
  const ranked = rankRows([
    row("META", 300, 0.3),
    row("005930", 200, 0.3, { country: "한국" }),
    row("SPY", 500, 0.4, { assetType: "ETF" }),
  ]);
  const stocks = buildBuckets(ranked, "assetType").find(
    (b) => b.label === "주식",
  )!;

  it("겉묶음의 구성원만 다시 묶는다 — 미국 ETF 는 안 들어온다", () => {
    const subs = buildSubBuckets(ranked, stocks, "country");
    expect(labels(subs).sort()).toEqual(["미국", "한국"]);
    const us = subs.find((b) => b.label === "미국")!;
    expect(us.members).toEqual(["META"]); // SPY 는 주식 묶음 밖
  });

  it("두 축이 겹친 묶음이 나온다 — '미국 주식만'", () => {
    const us = buildSubBuckets(ranked, stocks, "country").find(
      (b) => b.label === "미국",
    )!;
    expect(us.count).toBe(1);
    expect(us.members).not.toContain("SPY");
  });

  it("좁힐 게 없으면 하나만 나온다 — 화면이 그걸 보고 목록을 숨긴다", () => {
    const etf = buildBuckets(ranked, "assetType").find(
      (b) => b.label === "ETF",
    )!;
    expect(buildSubBuckets(ranked, etf, "country")).toHaveLength(1);
  });

  it("겉묶음 구성원 수가 보존된다 — 종목이 조용히 사라지지 않게", () => {
    const subs = buildSubBuckets(ranked, stocks, "country");
    expect(subs.reduce((s, b) => s + b.count, 0)).toBe(stocks.count);
  });

  it("축이 둘뿐이라 짝이 하나로 정해진다", () => {
    expect(subLensOf("assetType")).toBe("country");
    expect(subLensOf("country")).toBe("assetType");
  });
});
