import { describe, it, expect } from "vitest";
import {
  toFlowAmount,
  maskCompatible,
  normalizeName,
  matchAccount,
  reconcileFlows,
  reconcileCash,
  reconcileHoldings,
  monthlyIncome,
  formatIncome,
  type VaultAccount,
  type VaultHolding,
  type VaultFlow,
} from "./reconcile";
import type { ParsedStatement } from "./parse";

const statement = (over: Partial<ParsedStatement> = {}): ParsedStatement => ({
  broker: "키움증권",
  accountNo: "6292-1***-10",
  accountName: "홍길동",
  asOf: "2026-10-31",
  periodFrom: "2026-10-01",
  periodTo: "2026-10-31",
  cash: 129796,
  currency: "KRW",
  holdings: [
    { name: "TIGER 200", quantity: 2, price: 90640, value: 181280 },
    { name: "KODEX 미국S&P500", quantity: 203, price: 22945, value: 4657835 },
  ],
  events: [
    { date: "2026-10-01", type: "DEPOSIT", label: "이체입금", currency: "KRW", amount: 100000, fee: 0, tax: 0 },
    { date: "2026-10-02", type: "DIVIDEND", label: "수익분배금입금", currency: "KRW", name: "KODEX코리아밸류업", amount: 1600, fee: 0, tax: 0 },
    { date: "2026-10-11", type: "INTEREST", label: "예탁금이용료", currency: "KRW", amount: 1059, fee: 0, tax: 0 },
    { date: "2026-10-23", type: "DEPOSIT", label: "이체입금", currency: "KRW", amount: 100000, fee: 0, tax: 0 },
  ],
  ...over,
});

const CODES: Record<string, string> = {
  "TIGER200": "102110",
  "KODEX미국S&P500": "379800",
  "KODEX코리아밸류업": "495850",
};
const codeOf = (name: string) => CODES[normalizeName(name)];

describe("toFlowAmount", () => {
  it("입금은 음수, 출금은 양수 — 장부의 관찰된 규약", () => {
    expect(toFlowAmount("DEPOSIT", 100000)).toBe(-100000);
    expect(toFlowAmount("WITHDRAWAL", 50000)).toBe(50000);
  });

  it("입출금이 아닌 거래는 현금흐름으로 바꾸지 않는다", () => {
    expect(() => toFlowAmount("BUY", 1)).toThrow(/바꿀 수 없는/);
  });
});

describe("maskCompatible", () => {
  it("서로 다른 자리를 가린 두 마스크를 맞춰본다", () => {
    // 실제 사례: 명세서 6292-1***-10 ↔ 장부 ***-1953-10
    expect(maskCompatible("6292-1***-10", "***-1953-10")).toBe(true);
  });

  it("드러난 숫자가 어긋나면 다른 계좌다", () => {
    expect(maskCompatible("6292-1***-10", "***-6945-10")).toBe(false);
    expect(maskCompatible("6292-1***-10", "***-8727-11")).toBe(false);
  });

  it("자릿수가 다르면 판단하지 않는다", () => {
    expect(maskCompatible("378-3**-2**", "***-***-226-01")).toBe(false);
  });

  it("빈 값은 false", () => {
    expect(maskCompatible(undefined, "***-1953-10")).toBe(false);
  });
});

describe("matchAccount", () => {
  const accounts: VaultAccount[] = [
    { id: "A", mask: "***-1953-10" },
    { id: "B", mask: "***-6945-10" },
    { id: "CASH", mask: "6292-1***-10" },
  ];
  const holdings: VaultHolding[] = [
    { account: "A", code: "102110", quantity: 2 },
    { account: "A", code: "379800", quantity: 203 },
    { account: "B", code: "495850", quantity: 10 },
  ];

  it("보유 종목이 겹치는 계좌를 고른다", () => {
    const m = matchAccount(statement(), accounts, holdings, codeOf);
    expect(m?.account.id).toBe("A");
    expect(m?.score).toBe(1);
  });

  it("절반도 안 겹치면 짝짓지 않는다 — 엉뚱한 계좌에 쓰느니 못 찾는 게 낫다", () => {
    const only = [{ account: "B", code: "495850", quantity: 10 }];
    expect(matchAccount(statement(), [{ id: "B" }], only, codeOf)).toBeNull();
  });

  it("보유가 없는 현금계좌는 마스크로 짝짓는다", () => {
    const cashOnly = statement({ holdings: [] });
    const m = matchAccount(cashOnly, [{ id: "CASH", mask: "6292-1***-10" }], [], codeOf);
    expect(m?.account.id).toBe("CASH");
  });

  it("마스크가 동시에 맞는 계좌가 둘이면 고르지 않는다 — 남의 계좌에 쓰는 사고를 막는다", () => {
    const cashOnly = statement({ holdings: [] });
    // ***-1953-10 과 6292-1***-10 은 서로 가린 자리가 달라 둘 다 들어맞는다
    expect(matchAccount(cashOnly, accounts, [], codeOf)).toBeNull();
  });
});

describe("reconcileFlows", () => {
  it("이미 있고 맞으면 아무것도 보고하지 않는다", () => {
    const flows: VaultFlow[] = [
      { id: "1", account: "A", date: "2026-10-01", amount: -100000 },
      { id: "2", account: "A", date: "2026-10-23", amount: -100000 },
    ];
    expect(reconcileFlows(statement(), "A", flows)).toEqual([]);
  });

  it("빠진 입금을 찾아낸다", () => {
    const flows: VaultFlow[] = [{ id: "1", account: "A", date: "2026-10-01", amount: -100000 }];
    const diffs = reconcileFlows(statement(), "A", flows);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({ kind: "flow-missing", expected: -100000 });
    expect(diffs[0].message).toContain("2026-10-23");
  });

  it("같은 날 금액이 다르면 금액 불일치로 구분한다", () => {
    const flows: VaultFlow[] = [
      { id: "1", account: "A", date: "2026-10-01", amount: -90000 },
      { id: "2", account: "A", date: "2026-10-23", amount: -100000 },
    ];
    const diffs = reconcileFlows(statement(), "A", flows);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({ kind: "flow-amount", current: -90000, expected: -100000 });
  });

  it("다른 계좌의 현금흐름은 보지 않는다", () => {
    const flows: VaultFlow[] = [
      { id: "1", account: "다른계좌", date: "2026-10-01", amount: -100000 },
      { id: "2", account: "다른계좌", date: "2026-10-23", amount: -100000 },
    ];
    expect(reconcileFlows(statement(), "A", flows)).toHaveLength(2);
  });

  it("배당·이자는 현금흐름으로 넣지 않는다 — 원금 유입이 아니다", () => {
    const flows: VaultFlow[] = [
      { id: "1", account: "A", date: "2026-10-01", amount: -100000 },
      { id: "2", account: "A", date: "2026-10-23", amount: -100000 },
    ];
    const diffs = reconcileFlows(statement(), "A", flows);
    expect(diffs.every((d) => !d.label.includes("분배금"))).toBe(true);
  });
});

describe("reconcileCash / reconcileHoldings", () => {
  it("기준일이 같을 때만 예수금을 비교한다", () => {
    const same: VaultAccount = { id: "A", cash: 129796, valuationDate: "2026-10-31" };
    expect(reconcileCash(statement(), same)).toEqual([]);

    const wrong: VaultAccount = { id: "A", cash: 999, valuationDate: "2026-10-31" };
    expect(reconcileCash(statement(), wrong)[0]).toMatchObject({ kind: "cash", current: 999, expected: 129796 });
  });

  it("기준일이 다르면 비교하지 않는다 — 그사이 거래로 달라지므로 거짓 경보가 된다", () => {
    const later: VaultAccount = { id: "A", cash: 263054, valuationDate: "2026-11-05" };
    expect(reconcileCash(statement(), later)).toEqual([]);
    expect(reconcileHoldings(statement(), later, [], codeOf)).toEqual([]);
  });

  it("기준일이 같으면 수량 차이를 짚는다", () => {
    const account: VaultAccount = { id: "A", valuationDate: "2026-10-31" };
    const holdings: VaultHolding[] = [{ account: "A", code: "102110", quantity: 5 }];
    const diffs = reconcileHoldings(statement(), account, holdings, codeOf);
    expect(diffs).toHaveLength(2);
    expect(diffs[0]).toMatchObject({ kind: "holding-quantity", current: 5, expected: 2 });
    expect(diffs[1]).toMatchObject({ kind: "holding-missing", expected: 203 });
  });
});

describe("monthlyIncome", () => {
  it("해외 계좌의 섞인 통화를 따로 모은다 — 달러 배당과 원화 이자를 더하면 뜻이 없다", () => {
    const mixed = statement({
      events: [
        { date: "2026-09-05", type: "DIVIDEND", label: "배당금", amount: 6.84, currency: "USD", fee: 0, tax: 0 },
        { date: "2026-09-11", type: "INTEREST", label: "예탁금이용료", amount: 2186, currency: "KRW", fee: 0, tax: 0 },
      ],
    });
    expect(monthlyIncome(mixed)).toEqual({ dividend: { USD: 6.84 }, interest: { KRW: 2186 } });
    expect(formatIncome({ USD: 6.84 })).toBe("USD 6.84");
    expect(formatIncome({ KRW: 1600 })).toBe("1,600원");
    expect(formatIncome({})).toBe("0");
  });

  it("그 달의 배당·이자를 나눠 합산한다", () => {
    expect(monthlyIncome(statement())).toEqual({
      dividend: { KRW: 1600 },
      interest: { KRW: 1059 },
    });
  });
});

describe("normalizeName", () => {
  it("TIGER200 과 TIGER 200 을 같게 본다 — 명세서가 띄어쓰기를 다르게 쓴다", () => {
    expect(normalizeName("TIGER200")).toBe(normalizeName("TIGER 200"));
  });
});
