import { describe, expect, it } from "vitest";
import {
  disclosurePriority,
  prepareDisclosureFeed,
} from "./disclosureFeed";
import type { Disclosure } from "./dart";

function disclosure(overrides: Partial<Disclosure>): Disclosure {
  return {
    date: "2026-06-19",
    title: "기타 공시",
    rceptNo: "1",
    url: "https://example.com",
    corpName: "회사",
    stockCode: "005930",
    ...overrides,
  };
}

describe("disclosurePriority", () => {
  it("경고 힌트와 SEC 8-K를 중요로 분류한다", () => {
    expect(
      disclosurePriority(
        disclosure({ hint: { tone: "warn", text: "확인" } }),
      ),
    ).toBe("important");
    expect(disclosurePriority(disclosure({ title: "8-K · Current report" }))).toBe(
      "important",
    );
  });

  it("정기보고와 해석 힌트가 있는 공시는 참고로 분류한다", () => {
    expect(disclosurePriority(disclosure({ title: "10-Q" }))).toBe("reference");
    expect(
      disclosurePriority(
        disclosure({ hint: { tone: "info", text: "실적 확인" } }),
      ),
    ).toBe("reference");
  });

  it("해석 규칙이 없는 공시는 전체 탭용 노이즈로 둔다", () => {
    expect(disclosurePriority(disclosure({}))).toBe("noise");
  });
});

describe("prepareDisclosureFeed", () => {
  it("접수번호 중복을 제거하고 최신순으로 정렬한다", () => {
    const result = prepareDisclosureFeed([
      disclosure({ rceptNo: "a", date: "2026-01-01" }),
      disclosure({ rceptNo: "b", date: "2026-03-01" }),
      disclosure({ rceptNo: "a", date: "2026-01-01" }),
    ]);
    expect(result.map((item) => item.rceptNo)).toEqual(["b", "a"]);
    expect(result[0].readKey).toBe("disc:b");
  });
});
