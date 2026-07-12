import { describe, it, expect } from "vitest";
import { parseRtmsXml } from "./parse";

function item(fields: Record<string, string>): string {
  const body = Object.entries(fields)
    .map(([k, v]) => `<${k}>${v}</${k}>`)
    .join("");
  return `<item>${body}</item>`;
}

function response(items: string[], totalCount = items.length): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header>
  <body>
    <items>${items.join("")}</items>
    <numOfRows>1000</numOfRows><pageNo>1</pageNo><totalCount>${totalCount}</totalCount>
  </body>
</response>`;
}

const APT_ITEM = {
  aptNm: "래미안원베일리",
  excluUseAr: "84.98",
  dealAmount: "142,500",
  dealYear: "2026",
  dealMonth: "6",
  dealDay: "4",
  floor: "15",
  umdNm: "반포동",
  jibun: "2-12",
};

describe("parseRtmsXml", () => {
  it("아파트 item에서 금액(만원·콤마)·날짜(zero-pad)를 정규화한다", () => {
    const { deals, totalCount } = parseRtmsXml(response([item(APT_ITEM)]));
    expect(totalCount).toBe(1);
    expect(deals[0]).toEqual({
      name: "래미안원베일리",
      area: 84.98,
      amountKrw: 1_425_000_000,
      date: "2026-06-04",
      floor: 15,
      dong: "반포동",
      jibun: "2-12",
    });
  });

  it("연립다세대(mhouseNm)·오피스텔(offiNm) 태그도 단지명으로 읽는다", () => {
    const common = Object.fromEntries(
      Object.entries(APT_ITEM).filter(([k]) => k !== "aptNm"),
    );
    const xml = response([
      item({ ...common, mhouseNm: "행복빌라" }),
      item({ ...common, offiNm: "강남오피스텔" }),
    ]);
    const { deals } = parseRtmsXml(xml);
    expect(deals.map((d) => d.name)).toEqual(["행복빌라", "강남오피스텔"]);
  });

  it("해제거래(cdealType/cdealDay)는 제외한다", () => {
    const canceled = item({ ...APT_ITEM, cdealType: "O", cdealDay: "26.06.20" });
    const { deals } = parseRtmsXml(response([canceled, item(APT_ITEM)], 2));
    expect(deals).toHaveLength(1);
  });

  it("층이 없으면 null (연립 일부)", () => {
    const noFloor = { ...APT_ITEM } as Record<string, string>;
    delete noFloor.floor;
    const { deals } = parseRtmsXml(response([item(noFloor)]));
    expect(deals[0].floor).toBeNull();
  });

  it("빈 items 는 빈 배열", () => {
    expect(parseRtmsXml(response([])).deals).toEqual([]);
  });

  it("오류 resultCode 는 throw (쿼터 초과 등)", () => {
    const xml = `<response><header><resultCode>22</resultCode><resultMsg>LIMITED NUMBER OF SERVICE REQUESTS EXCEEDS</resultMsg></header></response>`;
    expect(() => parseRtmsXml(xml)).toThrow(/22/);
  });

  it("게이트웨이 오류(OpenAPI_ServiceResponse)도 throw", () => {
    const xml = `<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>`;
    expect(() => parseRtmsXml(xml)).toThrow(/SERVICE_KEY/);
  });
});
