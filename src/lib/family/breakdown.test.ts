import { describe, expect, it } from "vitest";
import { accountGroup, emptyPortfolio, summarize, validatePortfolio, type Portfolio } from "./model";
import { allocationBreakdown, consolidateHoldings, productKind, sortHoldings, targetActuals } from "./breakdown";

function sample(): Portfolio {
  const p = emptyPortfolio(); p.asOf = "2025-01-01";
  const account = (id: string, type: string, cash: number) => ({ id, owner: "P01", broker: "KB", name: id, type, mask: "", cash, complete: true, div: 0, interest: 0, realized: 0 });
  p.accounts = [account("general", "위탁종합", 1000), account("cma", "CMA(RP형)", 500), account("isa", "개인종합자산관리계좌", 0), account("pension", "연금저축", 0), account("irp", "퇴직연금운용", 0)];
  p.accounts[0].cashByCurrency = { KRW: 900, USD: 100 };
  p.products = {
    "005930": { name: "삼성전자", price: 100, exposure: [1, 0, 0, 0, 0] },
    META: { name: "메타", price: 1000, exposure: [0, 0, 1, 0, 0] },
    "283580": { name: "KODEX차이나CSI300", price: 10, exposure: [0, 1, 0, 0, 0] },
    "284430": { name: "KODEX200미국채혼합50", price: 10, exposure: [.5, 0, 0, 0, .5], bondCountry: [0, 0, 1, 0] },
    FD: { name: "퇴직연금정기예금", price: 1, exposure: [0, 0, 0, 0, 1] },
    NOPRICE: { name: "가격없음", price: null, exposure: [1, 0, 0, 0, 0] },
  };
  p.holdings = [
    { account: "general", code: "005930", quantity: 10, cost: 800 },
    { account: "isa", code: "005930", quantity: 5, cost: 600 },
    { account: "general", code: "META", quantity: 1, cost: 1200 },
    { account: "pension", code: "283580", quantity: 100, cost: 950 },
    { account: "pension", code: "284430", quantity: 100, cost: 1000 },
    { account: "irp", code: "FD", quantity: 2000, cost: 1990 },
  ];
  return p;
}

describe("계좌 유형 필터", () => {
  it("계좌 유형을 기본·ISA·연금저축·IRP로 나눔", () => {
    expect(["위탁종합", "종합위탁", "CMA", "CMA(RP형)", "개인종합자산관리계좌", "연금저축", "퇴직연금운용", "IRP"].map(accountGroup))
      .toEqual(["basic", "basic", "basic", "basic", "isa", "pension", "irp", "irp"]);
  });
  it("선택한 유형의 계좌만 집계", () => {
    const p = sample();
    expect(summarize(p, "all", "all", "all", "basic").selected.map(a => a.id)).toEqual(["general", "cma"]);
    expect(summarize(p, "all", "all", "all", "irp").nav).toBe(2000);
    expect(summarize(p, "all", "all", "all", "all").selected).toHaveLength(5);
  });
});

describe("보유상품 합산", () => {
  it("같은 상품을 계좌와 상관없이 합치고 수익률은 합산 원가 기준", () => {
    const rows = consolidateHoldings(summarize(sample()));
    const samsung = rows.find(r => r.code === "005930")!;
    expect(rows.filter(r => r.code === "005930")).toHaveLength(1);
    expect(samsung).toMatchObject({ quantity: 15, cost: 1400, value: 1500, profit: 100, accounts: ["general", "isa"] });
    expect(samsung.rate).toBeCloseTo(100 / 1400, 10);
  });
  it("수익금·수익률 높은순·낮은순, 미평가는 항상 마지막", () => {
    const p = sample(); p.holdings.push({ account: "general", code: "NOPRICE", quantity: 1, cost: 10 });
    const rows = consolidateHoldings(summarize(p));
    expect(sortHoldings(rows, "profit", true).map(r => r.code)).toEqual(["005930", "283580", "FD", "284430", "META", "NOPRICE"]);
    expect(sortHoldings(rows, "rate", false).map(r => r.code)).toEqual(["META", "284430", "FD", "283580", "005930", "NOPRICE"]);
    expect(sortHoldings(rows, "value", false).at(-1)!.code).toBe("NOPRICE");
  });
});

describe("유형별 국가 비중", () => {
  it("상품 유형은 저장값 우선, 없으면 이름으로 추정", () => {
    const p = sample();
    expect(productKind(p.products["283580"])).toBe("etf");
    expect(productKind(p.products.FD)).toBe("deposit");
    expect(productKind(p.products.META)).toBe("stock");
    expect(productKind({ ...p.products.META, kind: "etf" })).toBe("etf");
  });
  it("ETF·개별주식·현금성을 국가별로 나누고 합계가 총자산과 같음", () => {
    const p = validatePortfolio(sample()), s = summarize(p), b = allocationBreakdown(p, s);
    expect(b.etf).toEqual([500, 1000, 0, 0]);
    expect(b.stock).toEqual([1500, 0, 1000, 0]);
    expect(b.cashLike).toEqual([900 + 500 + 2000, 0, 100 + 500, 0]);
    expect(b.cash).toEqual({ KRW: 1400, USD: 100 });
    expect(b.bond).toBe(500);
    expect(b.deposit).toBe(2000);
    const total = [...b.etf, ...b.stock, ...b.cashLike].reduce((x, y) => x + y, 0);
    expect(total).toBeCloseTo(s.nav, 8);
  });
  it("목표 비교의 기타에는 현금·채권이 들어감", () => {
    const s = summarize(sample()), actual = targetActuals(s);
    expect(actual).toEqual([2000, 1000, 1000, s.nav - 4000]);
    expect(actual[3]).toBe(1500 + 500 + 2000);
  });
  it("통화별 현금 합계와 채권 국가 비중을 검증", () => {
    const p = sample(); p.accounts[0].cashByCurrency = { KRW: 900, USD: 50 };
    expect(() => validatePortfolio(p)).toThrow(/통화별 현금/);
    const q = sample(); q.products["284430"].bondCountry = [0, 0, .5, 0];
    expect(() => validatePortfolio(q)).toThrow(/채권 국가/);
  });
});
