import { describe, it, expect } from "vitest";
import {
  identifyBroker,
  classifyAttachment,
  isStatementAttachment,
  safeFilename,
  monthRange,
  DEFAULT_RULES,
  type BrokerRule,
} from "./match";

describe("identifyBroker", () => {
  it("KB·키움 도메인을 가른다", () => {
    expect(identifyBroker("noreply@kbsec.com", "9월 거래내역서 안내")).toBe("KB증권");
    expect(identifyBroker("send@kiwoom.com", "10월 매매내역 안내")).toBe("키움증권");
  });

  it("대소문자·표시이름이 섞여도 판별한다", () => {
    expect(identifyBroker("KB증권 <No-Reply@KBSEC.COM>", "거래내역 통지")).toBe("KB증권");
  });

  it("도메인이 맞아도 제목이 거래내역이 아니면 제외한다", () => {
    expect(identifyBroker("noreply@kbsec.com", "이벤트 당첨 안내")).toBeNull();
  });

  it("모르는 발신자는 null", () => {
    expect(identifyBroker("ad@spam.example", "거래내역")).toBeNull();
  });

  it("규칙을 주입해 덮어쓸 수 있다", () => {
    const rules: BrokerRule[] = [
      { broker: "KB증권", fromContains: ["custom.example"], subjectContains: [] },
    ];
    expect(identifyBroker("x@custom.example", "제목 무관", rules)).toBe("KB증권");
  });
});

describe("classifyAttachment / isStatementAttachment", () => {
  it("확장자별로 분류한다", () => {
    expect(classifyAttachment("내역.xlsx")).toBe("xlsx");
    expect(classifyAttachment("내역.XLS")).toBe("xls");
    expect(classifyAttachment("a.csv")).toBe("csv");
    expect(classifyAttachment("a.pdf")).toBe("pdf");
    expect(classifyAttachment("a.zip")).toBe("zip");
    expect(classifyAttachment("logo.png")).toBe("other");
    expect(classifyAttachment("noext")).toBe("other");
  });

  it("이미지는 거래내역 첨부가 아니다", () => {
    expect(isStatementAttachment("거래내역.xlsx")).toBe(true);
    expect(isStatementAttachment("signature.png")).toBe(false);
  });
});

describe("safeFilename", () => {
  it("경로 탈출을 막는다", () => {
    expect(safeFilename("../../etc/passwd")).toBe("passwd");
    expect(safeFilename("..\\..\\windows\\system32\\cfg")).toBe("cfg");
  });

  it("앞쪽 점과 제어문자를 지운다", () => {
    expect(safeFilename(".bashrc")).toBe("bashrc");
    expect(safeFilename("a\u0000b.csv")).toBe("ab.csv");
  });

  it("한글 파일명은 보존한다", () => {
    expect(safeFilename("2026년09월_거래내역서.xlsx")).toBe("2026년09월_거래내역서.xlsx");
  });

  it("빈 이름이면 폴백", () => {
    expect(safeFilename("///")).toBe("attachment.bin");
    expect(safeFilename("...")).toBe("attachment.bin");
  });

  it("지나치게 긴 이름을 자른다", () => {
    expect(safeFilename("a".repeat(300)).length).toBe(150);
  });
});

describe("monthRange", () => {
  it("9월~10월은 9/1 부터 11/1 직전까지", () => {
    const { since, before } = monthRange("2026-09", "2026-10");
    expect(since.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(before.toISOString().slice(0, 10)).toBe("2026-11-01");
  });

  it("연을 넘기는 범위도 처리한다", () => {
    const { since, before } = monthRange("2025-12", "2026-01");
    expect(since.toISOString().slice(0, 10)).toBe("2025-12-01");
    expect(before.toISOString().slice(0, 10)).toBe("2026-02-01");
  });

  it("형식·순서 오류를 거부한다", () => {
    expect(() => monthRange("2026-9", "2026-10")).toThrow(/YYYY-MM/);
    expect(() => monthRange("2026-13", "2026-14")).toThrow(/범위/);
    expect(() => monthRange("2026-10", "2026-09")).toThrow(/앞섭니다/);
  });
});

describe("DEFAULT_RULES", () => {
  it("KB·키움 두 증권사를 덮는다", () => {
    expect(DEFAULT_RULES.map((r) => r.broker).sort()).toEqual(["KB증권", "키움증권"]);
  });
});
