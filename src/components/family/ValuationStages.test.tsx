import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import TargetMembers from "./TargetMembers";
import ValuationStages from "./ValuationStages";
import { emptyPortfolio, summarize } from "@/lib/family/model";

describe("가격 단계 표시", () => {
  it("미등록과 손상된 기준을 미도달로 표시하지 않음", () => {
    expect(renderToStaticMarkup(<ValuationStages basis={undefined} price={100} />)).toContain("가격 기준 미등록");
    expect(renderToStaticMarkup(<ValuationStages basis={{}} price={100} />)).toContain("가격 기준 확인 필요");
  });
  it("국가별 종목의 평가금액·비중·수익률 계산은 바꾸지 않음", () => {
    const p = emptyPortfolio();
    p.accounts = [{ id: "a", owner: "P01", broker: "가상", name: "검증용", type: "위탁", mask: "", cash: 0, complete: true, div: 0, interest: 0, realized: 0 }];
    p.products = { TEST: { name: "검증 종목", price: 100, exposure: [1, 0, 0, 0, 0, 0] } };
    p.holdings = [{ account: "a", code: "TEST", quantity: 10, cost: 800 }];
    const before = summarize(p);
    p.valuationAlerts = { TEST: { currency: "KRW", basisDate: "2026-06-30", updatedAt: "2026-10-29T00:00:00Z", methods: [{ id: "DCF", label: "역DCF", down: [300, 200, 100], up: [500, 600, 700], note: "가상 테스트 기준" }] } };
    expect(summarize(p)).toEqual(before);
    // The same country component renders for legacy files without the optional criteria.
    expect(renderToStaticMarkup(<TargetMembers data={p} s={summarize(p)} group={0} />)).toContain("개별 주식");
  });
  it("도달은 숫자와 체크·접근성 문구로도 구분하고 실제 시세시각 표시", () => {
    const basis = { currency: "KRW", basisDate: "2026-06-30", updatedAt: "2026-10-29T00:00:00Z", methods: [{ id: "DCF", label: "역DCF", down: [300, 200], up: [500, 600, 700], note: "가상 기준" }] };
    const html = renderToStaticMarkup(<ValuationStages basis={basis} price={200} marketTime={Date.now() / 1000} />);
    expect(html).toContain('aria-label="2차 도달"');
    expect(html).toContain('aria-label="3차 미도달"');
    expect(html).toContain("200원");
    expect(html).toContain("KST");
    expect(html).toContain("과거 도달 이력");
  });
});
