import { describe, expect, it } from "vitest";
import {
  summarizeBusinessDescription,
  summarizeBusinessReport,
} from "./companyProfile";

describe("summarizeBusinessDescription", () => {
  it("normalizes whitespace and keeps a short description intact", () => {
    expect(summarizeBusinessDescription("  Makes   chips.  ")).toBe("Makes chips.");
  });

  it("cuts a long description at a sentence boundary", () => {
    const result = summarizeBusinessDescription(
      "First sentence explains the core business. Second sentence adds detail. Third sentence is unnecessary.",
      80,
    );
    expect(result).toBe(
      "First sentence explains the core business. Second sentence adds detail.…",
    );
  });

  it("returns null for an empty description", () => {
    expect(summarizeBusinessDescription("   ")).toBeNull();
  });
});

describe("summarizeBusinessReport", () => {
  it("selects sentences that describe products and services", () => {
    const result = summarizeBusinessReport(`
      1. 사업의 개요
      회사는 1988년에 설립되었습니다.
      당사는 반도체를 제조하고 글로벌 고객에게 메모리 제품을 판매하는 사업을 영위합니다.
      본점의 주소는 서울특별시입니다.
      주요 서비스는 기업용 데이터 저장과 모바일 기기용 솔루션을 제공하는 것입니다.
    `);
    expect(result).toContain("반도체를 제조");
    expect(result).toContain("주요 서비스");
    expect(result).not.toContain("본점의 주소");
  });
});
