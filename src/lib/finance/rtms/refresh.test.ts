import { describe, it, expect, vi } from "vitest";
import { findLatestComparableDeal } from "./refresh";
import type { RtmsDeal } from "./parse";

function deal(date: string, amountKrw: number): RtmsDeal {
  return {
    name: "래미안원베일리",
    area: 84.98,
    amountKrw,
    date,
    floor: 10,
    dong: "반포동",
    jibun: "1",
  };
}

const BASE = {
  type: "APT" as const,
  lawdCd: "11650",
  complexName: "래미안 원베일리",
  area: 84.98,
  today: "2026-07-09",
};

describe("findLatestComparableDeal", () => {
  it("당월 무거래면 이전 달로 거슬러가고, 매칭되면 이후 월은 조회하지 않는다", async () => {
    const loadMonth = vi.fn(async (ymd: string) =>
      ymd === "202605" ? [deal("2026-05-14", 1_400_000_000)] : [],
    );
    const hit = await findLatestComparableDeal({ ...BASE, loadMonth });
    expect(hit?.amountKrw).toBe(1_400_000_000);
    // 202607(무) → 202606(무) → 202605(매칭) 까지 3회만 — 202604 이하 미조회
    expect(loadMonth.mock.calls.map((c) => c[0])).toEqual(["202607", "202606", "202605"]);
  });

  it("monthsBack 내내 무거래면 null", async () => {
    const loadMonth = vi.fn<(ymd: string) => Promise<RtmsDeal[]>>(async () => []);
    expect(await findLatestComparableDeal({ ...BASE, loadMonth })).toBeNull();
    expect(loadMonth).toHaveBeenCalledTimes(6); // 기본 6개월
  });

  it("연 경계를 넘는 역순 조회 (1월 → 전년 12월)", async () => {
    const loadMonth = vi.fn<(ymd: string) => Promise<RtmsDeal[]>>(async () => []);
    await findLatestComparableDeal({ ...BASE, today: "2026-01-15", monthsBack: 3, loadMonth });
    expect(loadMonth.mock.calls.map((c) => c[0])).toEqual(["202601", "202512", "202511"]);
  });
});
