import { describe, it, expect } from "vitest";
import { parseDomesticMaster, parseOverseasMaster } from "./masterParse";

/** 고정폭 국내 행 합성: part1(단축9+표준12+한글명) + 228자 trailer. */
function domesticLine(code: string, std: string, nameKo: string): string {
  const part1 = code.padEnd(9, " ") + std.padEnd(12, " ") + nameKo;
  return part1 + "X".repeat(228);
}

describe("parseDomesticMaster", () => {
  it("6자리 종목의 코드·한글명을 추출한다", () => {
    const text = [
      domesticLine("005930", "KR7005930003", "삼성전자"),
      domesticLine("000660", "KR7000660001", "SK하이닉스"),
    ].join("\n");
    const rows = parseDomesticMaster(text, "KOSPI");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ symbol: "005930", name_ko: "삼성전자", market: "KR", exchange: "KOSPI" });
    expect(rows[1].symbol).toBe("000660");
  });

  it("6자리가 아닌 코드(펀드 F-코드 등)는 제외한다", () => {
    const text = domesticLine("F70100026", "KRA...", "한투글로벌넥스트웨이브1");
    expect(parseDomesticMaster(text, "KOSPI")).toHaveLength(0);
  });

  it("228자보다 짧은 행은 건너뛴다", () => {
    expect(parseDomesticMaster("짧은행", "KOSDAQ")).toHaveLength(0);
  });
});

describe("parseOverseasMaster", () => {
  function overseasLine(cols: string[]): string {
    return cols.join("\t");
  }

  it("탭 구분에서 심볼·한글명·영문명·거래소·유형을 추출한다", () => {
    const line = overseasLine([
      "US", "512", "NAS", "NASDAQ", "AAPL", "AAPL", "애플", "APPLE INC", "2", "USD",
    ]);
    const rows = parseOverseasMaster(line);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      symbol: "AAPL",
      name_ko: "애플",
      name_en: "APPLE INC",
      exchange: "NAS",
      market: "US",
      asset_type: "STOCK",
    });
  });

  it("ETF 유형(3)을 라벨링한다", () => {
    const line = ["US", "512", "NAS", "NASDAQ", "QQQ", "QQQ", "인베스코 QQQ", "INVESCO QQQ TRUST", "3", "USD"].join("\t");
    expect(parseOverseasMaster(line)[0].asset_type).toBe("ETF");
  });

  it("헤더/짧은 행은 제외한다", () => {
    expect(parseOverseasMaster("Symbol\tx")).toHaveLength(0);
  });
});
