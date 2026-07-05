import { describe, expect, it } from "vitest";
import { computeCelebrations } from "./celebration";

const today = "2026-07-05";
// 설립일을 올해 안으로 잡아 anniversary() 트리거(1주년 미만)가 섞이지 않게 한다.
const foundedAt = "2026-01-01";

const baseOpts = {
  holdingName: "우리집 홀딩스",
  foundedAt,
  today,
  plan: null,
  dismissed: new Set<string>(),
};

describe("computeCelebrations — 상장(IPO, 036) 트리거", () => {
  it("상장일이 오늘이면 축하 신호를 만든다", () => {
    const out = computeCelebrations({ ...baseOpts, listedAt: today });
    const ipo = out.find((s) => s.key === `ipo:${today}`);
    expect(ipo).toBeDefined();
    expect(ipo?.text).toBe("우리집 홀딩스, 시장에 상장했어요");
    expect(ipo?.href).toBe("/ranking");
    expect(ipo?.tone).toBe("good");
  });

  it("상장일이 노출 창(14일) 안이면 계속 표시된다", () => {
    const out = computeCelebrations({ ...baseOpts, listedAt: "2026-06-25" }); // 10일 전
    expect(out.some((s) => s.key === "ipo:2026-06-25")).toBe(true);
  });

  it("상장일이 노출 창(14일)을 벗어나면 표시되지 않는다", () => {
    const out = computeCelebrations({ ...baseOpts, listedAt: "2026-06-01" }); // 34일 전
    expect(out.some((s) => s.key.startsWith("ipo:"))).toBe(false);
  });

  it("listedAt이 null(미상장/폐지)이면 트리거하지 않는다", () => {
    const out = computeCelebrations({ ...baseOpts, listedAt: null });
    expect(out.some((s) => s.key.startsWith("ipo:"))).toBe(false);
  });

  it("listedAt을 생략해도(undefined) 트리거하지 않는다", () => {
    const out = computeCelebrations(baseOpts);
    expect(out.some((s) => s.key.startsWith("ipo:"))).toBe(false);
  });

  it("디스미스된 key는 제외된다", () => {
    const out = computeCelebrations({
      ...baseOpts,
      listedAt: today,
      dismissed: new Set([`ipo:${today}`]),
    });
    expect(out.some((s) => s.key === `ipo:${today}`)).toBe(false);
  });

  it("재상장(새 listedAt)은 새 key라 다시 축하한다", () => {
    // 이전 상장(2026-01-10)은 디스미스됐지만, 폐지 후 재상장한 새 날짜(오늘)는 다른 key.
    const out = computeCelebrations({
      ...baseOpts,
      listedAt: today,
      dismissed: new Set(["ipo:2026-01-10"]),
    });
    expect(out.some((s) => s.key === `ipo:${today}`)).toBe(true);
  });
});
