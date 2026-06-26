import { describe, expect, it } from "vitest";
import { aggregateMemberGroups, type Member } from "./members";
import type { AccountGroup } from "./accounts";

function member(id: string, name = id, sortOrder = 0): Member {
  return { id, name, emoji: null, included: true, sortOrder };
}

function group(
  id: string,
  memberId: string | null,
  value: number,
  costBasis: number,
  gain: number | null,
): AccountGroup {
  return {
    id,
    name: id,
    accountType: "GENERAL",
    memberId,
    broker: null,
    value,
    changeRate: costBasis > 0 && gain !== null ? gain / costBasis : null,
    gain,
    costBasis,
    holdings: [],
  };
}

describe("aggregateMemberGroups", () => {
  it("전원 포함 시 컴퍼니 평가액 합 = 그룹 합산 평가액", () => {
    const members = [member("dad", "아빠"), member("mom", "엄마", 1)];
    const groups = [
      group("a1", "dad", 1000, 800, 200),
      group("a2", "dad", 500, 400, 100),
      group("a3", "mom", 300, 250, 50),
    ];
    const result = aggregateMemberGroups(members, groups);
    const totalValue = result.reduce((s, m) => s + m.value, 0);
    const groupTotal = groups.reduce((s, g) => s + g.value, 0);
    expect(totalValue).toBe(groupTotal);
  });

  it("컴퍼니별 차익은 가산, 등락은 gain/costBasis", () => {
    const members = [member("dad", "아빠")];
    const groups = [
      group("a1", "dad", 1000, 800, 200),
      group("a2", "dad", 500, 400, 100),
    ];
    const [dad] = aggregateMemberGroups(members, groups);
    expect(dad.gain).toBe(300);
    expect(dad.costBasis).toBe(1200);
    expect(dad.changeRate).toBeCloseTo(300 / 1200);
  });

  it("보유/원가 없는 컴퍼니는 gain·changeRate null('보유 없음')", () => {
    const members = [member("dad", "아빠"), member("kid", "아이", 1)];
    const groups = [group("a1", "dad", 1000, 800, 200)];
    const result = aggregateMemberGroups(members, groups);
    const kid = result.find((m) => m.member.id === "kid")!;
    expect(kid.value).toBe(0);
    expect(kid.gain).toBeNull();
    expect(kid.changeRate).toBeNull();
  });

  it("member_id=null 계좌는 기본 컴퍼니(정렬 첫 컴퍼니)에 귀속", () => {
    const members = [member("dad", "아빠"), member("mom", "엄마", 1)];
    const groups = [group("a1", null, 700, 500, 100)];
    const result = aggregateMemberGroups(members, groups);
    const dad = result.find((m) => m.member.id === "dad")!;
    const mom = result.find((m) => m.member.id === "mom")!;
    expect(dad.value).toBe(700);
    expect(mom.value).toBe(0);
  });

  it("컴퍼니가 없으면 빈 배열", () => {
    expect(aggregateMemberGroups([], [group("a1", null, 100, 80, 20)])).toEqual(
      [],
    );
  });
});
