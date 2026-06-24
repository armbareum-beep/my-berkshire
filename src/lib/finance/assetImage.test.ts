import { describe, it, expect } from "vitest";
import { assetImage } from "./assetImage";

describe("assetImage", () => {
  it("한국 기업 코드 → 로컬(svg·png) 우선 + FMP(.KS·.KQ) 후보", () => {
    const r = assetImage("005930", "삼성전자");
    expect(r.kind).toBe("company");
    expect(r.srcs[0]).toBe("/logos/005930.svg");
    expect(r.srcs[1]).toBe("/logos/005930.png");
    expect(r.srcs.some((s) => s.includes("005930.KS"))).toBe(true);
    expect(r.srcs.some((s) => s.includes("005930.KQ"))).toBe(true);
  });

  it("미등록 한국 종목도 로컬→FMP 후보 제공", () => {
    const r = assetImage("999999", "이름없는상사");
    expect(r.kind).toBe("company");
    expect(r.srcs[0]).toBe("/logos/999999.svg");
    expect(r.srcs.some((s) => s.includes("999999.KS"))).toBe(true);
  });

  it("미국 티커 → 로컬 우선 + FMP", () => {
    const r = assetImage("AAPL", "Apple");
    expect(r.kind).toBe("company");
    expect(r.srcs[0]).toBe("/logos/AAPL.svg");
    expect(r.srcs.some((s) => s.includes("/AAPL.png") && s.includes("financialmodelingprep"))).toBe(true);
  });

  it("ETF → 로컬 우선 + 셀프 호스팅 운용사 로고 + favicon 폴백", () => {
    const r = assetImage("069500", "KODEX 200");
    expect(r.kind).toBe("manager");
    expect(r.srcs[0]).toBe("/logos/069500.svg");
    expect(r.srcs.some((s) => s === "/logos/managers/samsung.png")).toBe(true);
    expect(r.srcs.some((s) => s.includes("samsungfund.com"))).toBe(true);
  });

  it("정식 펀드명(삼성KODEX…)도 부분일치로 운용사 매칭", () => {
    const r = assetImage("069500", "삼성KODEX200증권상장지수투자신탁");
    expect(r.kind).toBe("manager");
    expect(r.srcs.some((s) => s === "/logos/managers/samsung.png")).toBe(true);
  });

  it("소문자 'kodex 미국S&P500'도 운용사 매칭", () => {
    const r = assetImage("379800", "kodex 미국S&P500");
    expect(r.kind).toBe("manager");
    expect(r.srcs.some((s) => s === "/logos/managers/samsung.png")).toBe(true);
  });

  it("정식명 '삼성 미국S&P500'처럼 KODEX 빠진 이름은 매칭 실패(코드 매핑 필요)", () => {
    // 이름에 KODEX/코덱스가 없으면 운용사 인식 불가 → 첫 글자 폴백. 이게 '삼'의 원인일 수 있음.
    const r = assetImage("379800", "삼성 미국S&P500");
    expect(r.kind).toBe("company"); // manager 로 안 잡힘
  });

  it("ACE ETF → 한국투자 favicon", () => {
    const r = assetImage("123456", "ACE 미국S&P500");
    expect(r.kind).toBe("manager");
    expect(r.srcs.some((s) => s.includes("koreainvestment.com"))).toBe(true);
  });

  it("FMP 미보유 종목(시프트업)은 큐레이트 favicon 폴백", () => {
    const r = assetImage("462870", "시프트업");
    expect(r.kind).toBe("company");
    expect(r.srcs.some((s) => s.includes("shiftup.co.kr"))).toBe(true);
  });

  it("지수(^KS11) → 한국 국기 SVG", () => {
    const r = assetImage("^KS11", "코스피");
    expect(r.kind).toBe("index");
    expect(r.srcs[0]).toBe("/flags/kr.svg");
  });

  it("미국 지수(^GSPC) → 미국 국기 SVG", () => {
    expect(assetImage("^GSPC", "S&P 500").srcs[0]).toBe("/flags/us.svg");
  });

  it("환율 쌍(USDKRW=X) → 기준통화(미국) 국기", () => {
    const r = assetImage("USDKRW=X", "원/달러");
    expect(r.kind).toBe("fx");
    expect(r.srcs[0]).toBe("/flags/us.svg");
  });

  it("엔 환율(JPYKRW=X) → 일본 국기", () => {
    expect(assetImage("JPYKRW=X", "원/엔").srcs[0]).toBe("/flags/jp.svg");
  });

  it("비트코인(BTC-USD) → 코인 SVG", () => {
    const r = assetImage("BTC-USD", "비트코인");
    expect(r.kind).toBe("crypto");
    expect(r.srcs[0]).toBe("/coins/btc.svg");
  });

  it("코인 세트에 없는 암호화폐 → crypto + 폴백(srcs 빔)", () => {
    const r = assetImage("DOGE-USD", "도지코인");
    expect(r.kind).toBe("crypto");
    expect(r.srcs).toEqual([]);
  });

  it("동일 입력 → 동일 출력(결정성)", () => {
    expect(assetImage("005930", "삼성전자")).toEqual(
      assetImage("005930", "삼성전자"),
    );
  });

  it("opts.country 힌트가 PRESET 추론보다 우선", () => {
    const r = assetImage("^NEW", "임의지수", { country: "JP" });
    expect(r.srcs[0]).toBe("/flags/jp.svg");
  });
});
