import { describe, expect, it } from "vitest";
import { applyFirstKey, applyKey, grouped, formatNumber } from "./Keypad";

describe("applyFirstKey — 뜨자마자 누른 숫자는 기존 값을 지운다", () => {
  it("미리 채워진 금액을 이어 쓰지 않는다", () => {
    // 투자 가능 현금 50,000,000 이 깔려 있는데 3 을 누르면 500,000,003 이 되던 버그.
    expect(applyFirstKey("50000000", "3", false, true)).toBe("3");
  });

  it("두 번째부터는 이어 쓴다", () => {
    expect(applyFirstKey("3", "5", false, false)).toBe("35");
  });

  it("지우기는 예외 — 지울 값을 먼저 없애면 아무 일도 안 일어난다", () => {
    expect(applyFirstKey("60", "del", false, true)).toBe("6");
    expect(applyFirstKey("6", "del", false, false)).toBe("");
  });

  it("소수점으로 시작해도 새로 쓴다", () => {
    expect(applyFirstKey("60", ".", true, true)).toBe("0.");
    expect(applyFirstKey("0.", "5", true, false)).toBe("0.5");
  });

  it("0 을 먼저 눌러도 새로 쓴다", () => {
    expect(applyFirstKey("60", "0", false, true)).toBe("0");
  });

  it("fresh 가 아니면 예전 동작 그대로다", () => {
    for (const k of ["1", "0", "00", "del", "."]) {
      expect(applyFirstKey("12", k, true, false)).toBe(applyKey("12", k, true));
    }
  });
});

describe("applyKey — 기존 규칙은 그대로", () => {
  it("외톨이 0 은 교체한다", () => {
    expect(applyKey("0", "7", false)).toBe("7");
  });

  it("소수점은 한 번만", () => {
    expect(applyKey("1.5", ".", true)).toBe("1.5");
    expect(applyKey("", ".", true)).toBe("0.");
    expect(applyKey("1", ".", false)).toBe("1"); // decimal 아니면 무시
  });

  it("00 은 빈 값·0 에서는 아무 일도 안 한다", () => {
    expect(applyKey("", "00", false)).toBe("");
    expect(applyKey("0", "00", false)).toBe("0");
    expect(applyKey("5", "00", false)).toBe("500");
  });
});

describe("표시 형식", () => {
  it("정수부만 천단위 콤마", () => {
    expect(grouped("1234.5")).toBe("1,234.5");
    expect(grouped("")).toBe("");
  });

  it("빈 값은 0 자리로 그린다", () => {
    expect(formatNumber("", "₩")).toBe("₩0");
    expect(formatNumber("60", "", "%")).toBe("60%");
  });
});
