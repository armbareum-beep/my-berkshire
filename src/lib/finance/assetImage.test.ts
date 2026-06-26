import { describe, it, expect } from "vitest";
import { assetImage, externalLogoSources } from "./assetImage";

describe("assetImage", () => {
  // 회사/운용사 종목의 클라이언트 후보 = 로컬(svg·png) → 로고 프록시(/api/logo). 외부 소스는
  // 프록시가 서버에서 처리(externalLogoSources) — 광고차단 무력화·핫링크 방지.
  it("한국 기업 코드 → 로컬(svg·png) 우선 + 로고 프록시", () => {
    const r = assetImage("005930", "삼성전자");
    expect(r.kind).toBe("company");
    expect(r.srcs[0]).toBe("/logos/005930.svg");
    expect(r.srcs[1]).toBe("/logos/005930.png");
    expect(r.srcs[2]).toBe("/api/logo?symbol=005930");
  });

  it("미등록 한국 종목도 로컬→프록시 후보 제공", () => {
    const r = assetImage("999999", "이름없는상사");
    expect(r.kind).toBe("company");
    expect(r.srcs[0]).toBe("/logos/999999.svg");
    expect(r.srcs).toContain("/api/logo?symbol=999999");
  });

  it("미국 티커 → 로컬 우선 + 프록시", () => {
    const r = assetImage("AAPL", "Apple");
    expect(r.kind).toBe("company");
    expect(r.srcs[0]).toBe("/logos/AAPL.svg");
    expect(r.srcs).toContain("/api/logo?symbol=AAPL");
  });

  it("ETF → manager 분류 + 로컬→프록시(내접)", () => {
    const r = assetImage("069500", "KODEX 200");
    expect(r.kind).toBe("manager");
    expect(r.fit).toBe("inset");
    expect(r.srcs[0]).toBe("/logos/069500.svg");
    expect(r.srcs).toContain("/api/logo?symbol=069500");
  });

  it("정식 펀드명(삼성KODEX…)도 부분일치로 운용사(manager) 매칭", () => {
    expect(assetImage("069500", "삼성KODEX200증권상장지수투자신탁").kind).toBe("manager");
  });

  it("소문자 'kodex 미국S&P500'도 운용사 매칭", () => {
    expect(assetImage("379800", "kodex 미국S&P500").kind).toBe("manager");
  });

  it("정식명 '삼성 미국S&P500'처럼 KODEX 빠진 이름은 company로(코드 매핑 필요)", () => {
    expect(assetImage("379800", "삼성 미국S&P500").kind).toBe("company");
  });

  it("ACE ETF → manager 분류", () => {
    expect(assetImage("123456", "ACE 미국S&P500").kind).toBe("manager");
  });

  it("BRK/A 슬래시 심볼 → 안전 슬러그(_) 로컬 경로", () => {
    const r = assetImage("BRK/A", "버크셔A");
    expect(r.srcs[0]).toBe("/logos/BRK_A.svg");
    expect(r.srcs).toContain("/api/logo?symbol=BRK%2FA");
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
    expect(assetImage("005930", "삼성전자")).toEqual(assetImage("005930", "삼성전자"));
  });

  it("opts.country 힌트가 PRESET 추론보다 우선", () => {
    const r = assetImage("^NEW", "임의지수", { country: "JP" });
    expect(r.srcs[0]).toBe("/flags/jp.svg");
  });
});

describe("externalLogoSources (로고 프록시가 서버에서 시도할 외부 소스)", () => {
  it("국내 6자리 → 토스 CDN 우선 + FMP(.KS/.KQ)", () => {
    const srcs = externalLogoSources("005930");
    expect(srcs[0]).toContain("static.toss.im");
    expect(srcs[0]).toContain("005930");
    expect(srcs.some((s) => s.includes("005930.KS"))).toBe(true);
    expect(srcs.some((s) => s.includes("005930.KQ"))).toBe(true);
  });

  it("FMP 미보유 종목(시프트업)은 큐레이트 favicon까지 후보에", () => {
    expect(externalLogoSources("462870").some((s) => s.includes("shiftup.co.kr"))).toBe(true);
  });

  it("미국 티커 → FMP", () => {
    const srcs = externalLogoSources("AAPL");
    expect(srcs.some((s) => s.includes("/AAPL.png") && s.includes("financialmodelingprep"))).toBe(true);
  });

  it("BRK/A → FMP의 BRK-A·BRK.A 변형", () => {
    const srcs = externalLogoSources("BRK/A");
    expect(srcs.some((s) => s.includes("BRK-A"))).toBe(true);
    expect(srcs.some((s) => s.includes("BRK.A"))).toBe(true);
  });

  it("지수·환율·코인은 외부 소스 없음(로컬 전용)", () => {
    expect(externalLogoSources("^KS11")).toEqual([]);
    expect(externalLogoSources("USDKRW=X")).toEqual([]);
    expect(externalLogoSources("BTC-USD")).toEqual([]);
    expect(externalLogoSources("GC=F")).toEqual([]);
  });
});
