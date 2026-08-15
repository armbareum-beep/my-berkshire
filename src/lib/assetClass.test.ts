import { describe, expect, it } from "vitest";
import {
  applyAssetClassOverrides,
  readAssetClassOverrides,
  suggestAssetClass,
} from "./assetClass";

describe("suggestAssetClass — 채권", () => {
  it("사용자가 실제로 들고 있(었)는 국채 ETF 를 채권으로 옮긴다", () => {
    const names = [
      "KODEX미국30년국채액티브(H)",
      "RISE미국30년국채액티브",
      "PLUS일본엔화초단기국채(합성)",
      "TIGER미국초단기국채",
      "TIGER단기채권액티브",
    ];
    for (const name of names) {
      expect(suggestAssetClass(name, "ETF"), name).toBe("채권");
    }
  });

  it("영문 이름도 잡는다", () => {
    expect(suggestAssetClass("iShares Core U.S. Aggregate Bond ETF", "ETF")).toBe(
      "채권",
    );
    expect(suggestAssetClass("SPDR 1-3 Month T-Bill ETF", "ETF")).toBe("채권");
  });

  it("티커만 있는 이름은 못 잡는다 — 제안이 전부를 맞힐 필요는 없다", () => {
    // `BIL` 은 이름에 단서가 없다. 화면에서 한 번 눌러 고치는 게 정답이고,
    // 여기서 억지로 맞히려다 엉뚱한 종목을 채권으로 옮기는 쪽이 훨씬 나쁘다.
    expect(suggestAssetClass("BIL", "ETF")).toBeNull();
  });
});

describe("suggestAssetClass — 원자재", () => {
  it("실물 ETF 를 원자재로 옮긴다", () => {
    expect(suggestAssetClass("ACE KRX금현물", "ETF")).toBe("원자재");
    expect(suggestAssetClass("KODEX 은선물(H)", "ETF")).toBe("원자재");
    expect(suggestAssetClass("TIGER 원유선물Enhanced(H)", "ETF")).toBe("원자재");
  });

  it("이름에 '금'이 들어간 금융주를 원자재로 만들지 않는다", () => {
    expect(suggestAssetClass("삼성금융지주", "주식")).toBeNull();
    expect(suggestAssetClass("메리츠금융지주", "주식")).toBeNull();
  });
});

describe("suggestAssetClass — 안 건드리는 것들", () => {
  it("혼합형은 어느 한쪽으로도 몰지 않는다", () => {
    // 이름에 "미국채"가 있지만 주식+채권이라, 채권으로 옮기면 주식 익스포저가 사라진다.
    expect(suggestAssetClass("KODEX 200미국채혼합", "ETF")).toBeNull();
    expect(suggestAssetClass("KB 온국민TDF2050", "ETF")).toBeNull();
  });

  it("주식형 ETF·개별주는 그대로 둔다", () => {
    expect(suggestAssetClass("KODEX코리아밸류업", "ETF")).toBeNull();
    expect(suggestAssetClass("TIGER차이나항셍테크", "ETF")).toBeNull();
    expect(suggestAssetClass("버크셔 해서웨이 B", "주식")).toBeNull();
    expect(suggestAssetClass("삼성전자", "주식")).toBeNull();
  });

  it("이미 구체적으로 분류된 종목은 다시 보지 않는다", () => {
    // 카탈로그가 맞게 넣었거나 사용자가 정한 값이다. 되돌리면 안 된다.
    expect(suggestAssetClass("ACE KRX금현물", "원자재")).toBeNull();
    expect(suggestAssetClass("KODEX미국30년국채액티브(H)", "채권")).toBeNull();
    expect(suggestAssetClass("비트코인", "코인")).toBeNull();
  });

  it("같은 값을 다시 제안하지 않는다", () => {
    expect(suggestAssetClass("아무거나", "ETF")).toBeNull();
  });
});

describe("readAssetClassOverrides — 임의 JSON 을 방어한다", () => {
  it("자산군이 아닌 값은 버린다", () => {
    expect(
      readAssetClassOverrides({ BIL: "채권", X: "부동산", Y: 3, Z: null }),
    ).toEqual({ BIL: "채권" });
  });

  it("객체가 아니면 빈 값", () => {
    expect(readAssetClassOverrides(null)).toEqual({});
    expect(readAssetClassOverrides("채권")).toEqual({});
    expect(readAssetClassOverrides(undefined)).toEqual({});
  });
});

describe("applyAssetClassOverrides — 카탈로그 위에 덮어쓴다", () => {
  const meta: Record<string, { assetType: string; label: string }> = {
    BIL: { assetType: "ETF", label: "BIL" },
    "005930": { assetType: "주식", label: "삼성전자" },
  };

  it("덮어쓴 종목만 바뀐다", () => {
    const out = applyAssetClassOverrides(meta, { BIL: "채권" });
    expect(out.BIL?.assetType).toBe("채권");
    expect(out["005930"]?.assetType).toBe("주식");
  });

  it("다른 필드는 보존된다 — 유형만 갈아끼운다", () => {
    const out = applyAssetClassOverrides(meta, { BIL: "채권" });
    expect(out.BIL?.label).toBe("BIL");
  });

  it("원본을 건드리지 않는다", () => {
    applyAssetClassOverrides(meta, { BIL: "채권" });
    expect(meta.BIL.assetType).toBe("ETF");
  });

  it("들고 있지 않은 심볼의 덮어쓰기는 무시한다", () => {
    const out = applyAssetClassOverrides(meta, { NOTHELD: "채권" });
    expect(out.NOTHELD).toBeUndefined();
  });

  it("덮어쓸 게 없으면 같은 객체를 돌려준다", () => {
    expect(applyAssetClassOverrides(meta, {})).toBe(meta);
  });
});
