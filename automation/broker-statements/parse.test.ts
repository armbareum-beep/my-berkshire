import { describe, it, expect } from "vitest";
import {
  parseKiwoom,
  parseKb,
  parseKbDetail,
  classifyEvent,
  toNumber,
  toDate,
} from "./parse";
import { detectBroker } from "./decrypt";

/** 실제 양식과 같은 구조의 가상 자료. 사용자 실데이터는 저장소에 두지 않는다. */
const rows = (text: string): string[][] =>
  text
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => l.split("\t"));

const KIWOOM = rows(`
계좌번호\t1234-5***-67\t계좌명\t홍길동
잔고기준일\t2026/10/31\t대상기간\t2026/10/01-2026/10/31
예수금\t129,796\t미수금/미납대금\t0
신용융자금\t0\t대출금\t0
종류\t구분\t종목명\t수량\t평가단가\t대출일\t만기일\t평가금액
주식\t현금잔고\tTIGER 200\t2\t90,640\t\t\t181,280
주식\t현금잔고\tKODEX 미국S&P500\t203\t22,945\t\t\t4,657,835
합계\t4,839,115
일자\t거래구분\t종목명\t수수료\t제세금
수량\t가격\t거래금액\t예수금잔액
2026/10/01\t이체입금(지급결제)\t\t0\t0
0\t0\t100,000\t201,757
2026/10/02\t수익분배금입금\tKODEX코리아밸류업\t0\t0
0\t0\t1,600\t203,357
2026/10/11\t예탁금이용료(이자)입금\t\t0\t0
0\t0\t1,059\t204,416
2026/10/19\t장내매수\tTIGER200\t20\t0
2\t87,300\t174,600\t29,796
`);

const KB = rows(`
영업점\t어느지점\t작성기준일\t20261031
계좌번호\t111-2**-3**\t계좌명\t홍길동
거래기간\t20261001 ∼ 20261031
01 신연금저축\t
보유잔액현황\t단위(금액:원)
예수금(원화)\t2,374\t기타대여금\t0
유가증권잔고현황
구분\t종목명\t수량\t금액\t대출일 / 만기일\t통화 코드
현금예탁\tKODEX 차이나CSI300\t1,746\t\t\t
현금예탁\tTIGER 차이나항셍테크\t4,084\t\t\t
※단위 (금액:원)
거래일자\t거래구분\t거래내역\t정산금액\t잔액
20261002\t배당금 (입금)\tKODEX 코리아밸류업 44,760원\t44,760\t483,724
20261019\t주식장내매수 (매수)\tTIGER 차이나항셍테크 80주 X 6,005원 = 480,400원 매수입고 80주 잔고 4,084주 수수료 950원\t-481,350\t2,374
`);

describe("toNumber / toDate", () => {
  it("쉼표·단위를 떼고 읽는다", () => {
    expect(toNumber("1,234,567")).toBe(1234567);
    expect(toNumber("80주")).toBe(80);
    expect(toNumber("")).toBe(0);
  });

  it("숫자가 아니면 조용히 0 으로 만들지 않고 오류를 낸다", () => {
    expect(() => toNumber("abc")).toThrow(/숫자로 읽을 수 없습니다/);
  });

  it("증권사별 날짜 표기를 모두 받는다", () => {
    expect(toDate("2026/10/31")).toBe("2026-10-31");
    expect(toDate("20261031")).toBe("2026-10-31");
    expect(toDate("2026-1-5")).toBe("2026-01-05");
    expect(() => toDate("10월 31일")).toThrow(/날짜 형식/);
  });
});

describe("classifyEvent", () => {
  it("두 증권사의 거래구분을 같은 타입으로 모은다", () => {
    expect(classifyEvent("장내매수")).toBe("BUY");
    expect(classifyEvent("주식장내매수 (매수)")).toBe("BUY");
    expect(classifyEvent("장내매도")).toBe("SELL");
    expect(classifyEvent("수익분배금입금")).toBe("DIVIDEND");
    expect(classifyEvent("배당금 (입금)")).toBe("DIVIDEND");
    expect(classifyEvent("예탁금이용료(이자)입금")).toBe("INTEREST");
    expect(classifyEvent("이체입금(지급결제)")).toBe("DEPOSIT");
    expect(classifyEvent("이체출금")).toBe("WITHDRAWAL");
  });

  it("매수가 입금보다 먼저 걸린다 — '매수입고' 같은 말에 속지 않는다", () => {
    expect(classifyEvent("주식장내매수 (매수)")).toBe("BUY");
  });

  it("모르는 구분은 버리지 않고 UNKNOWN 으로 남긴다", () => {
    expect(classifyEvent("무슨무슨대체")).toBe("UNKNOWN");
  });
});

describe("parseKiwoom", () => {
  const s = parseKiwoom(KIWOOM);

  it("계좌 머리말을 읽는다", () => {
    expect(s.broker).toBe("키움증권");
    expect(s.accountNo).toBe("1234-5***-67");
    expect(s.accountName).toBe("홍길동");
    expect(s.asOf).toBe("2026-10-31");
    expect(s.periodFrom).toBe("2026-10-01");
    expect(s.periodTo).toBe("2026-10-31");
    expect(s.cash).toBe(129796);
  });

  it("잔고를 합계 직전까지 읽는다", () => {
    expect(s.holdings).toHaveLength(2);
    expect(s.holdings[0]).toEqual({
      name: "TIGER 200",
      quantity: 2,
      price: 90640,
      value: 181280,
    });
  });

  it("두 줄로 나뉜 거래를 한 건으로 합친다", () => {
    expect(s.events).toHaveLength(4);
    const buy = s.events.find((e) => e.type === "BUY")!;
    expect(buy).toMatchObject({
      date: "2026-10-19",
      name: "TIGER200",
      quantity: 2,
      price: 87300,
      amount: 174600,
      fee: 20,
    });
  });

  it("매수 금액은 수량×가격과 맞는다", () => {
    const buy = s.events.find((e) => e.type === "BUY")!;
    expect(buy.amount).toBe(buy.quantity! * buy.price!);
  });

  it("종목 없는 입금·이자도 빠뜨리지 않는다", () => {
    expect(s.events.filter((e) => e.type === "DEPOSIT")).toHaveLength(1);
    expect(s.events.find((e) => e.type === "INTEREST")?.amount).toBe(1059);
  });

  it("둘째 줄이 없으면 조용히 넘기지 않고 멈춘다", () => {
    const broken = rows(`
일자\t거래구분\t종목명\t수수료\t제세금
수량\t가격\t거래금액\t예수금잔액
2026/10/19\t장내매수\tTIGER200\t20\t0
`);
    expect(() => parseKiwoom([...KIWOOM.slice(0, 2), ...broken])).toThrow(/둘째 줄/);
  });
});

describe("parseKbDetail", () => {
  it("매매 한 덩어리 문장에서 수량·가격·수수료를 뽑는다", () => {
    expect(
      parseKbDetail("TIGER 차이나항셍테크 80주 X 6,005원 = 480,400원 매수입고 80주 잔고 4,084주 수수료 950원"),
    ).toEqual({ name: "TIGER 차이나항셍테크", quantity: 80, price: 6005, fee: 950 });
  });

  it("배당처럼 금액만 있는 줄은 종목명만 뽑는다", () => {
    expect(parseKbDetail("KODEX 코리아밸류업 44,760원")).toEqual({
      name: "KODEX 코리아밸류업",
      fee: 0,
    });
  });

  it("빈 칸이어도 터지지 않는다", () => {
    expect(parseKbDetail("")).toEqual({ fee: 0 });
  });
});

describe("parseKb", () => {
  const s = parseKb(KB);

  it("계좌 머리말과 계좌 구분을 읽는다", () => {
    expect(s.broker).toBe("KB증권");
    expect(s.accountNo).toBe("111-2**-3**");
    expect(s.accountName).toBe("홍길동");
    expect(s.accountLabel).toBe("01 신연금저축");
    expect(s.asOf).toBe("2026-10-31");
    expect(s.cash).toBe(2374);
  });

  it("잔고는 수량만 있고 평가금액이 없다", () => {
    expect(s.holdings).toHaveLength(2);
    expect(s.holdings[0]).toEqual({
      name: "KODEX 차이나CSI300",
      quantity: 1746,
      price: null,
      value: null,
    });
  });

  it("거래를 읽고, 금액은 수수료를 뺀 거래대금으로 맞춘다", () => {
    expect(s.events).toHaveLength(2);
    const buy = s.events.find((e) => e.type === "BUY")!;
    // 정산금액 481,350 이 아니라 거래대금 480,400 — 키움과 같은 의미로 맞춘다
    expect(buy.amount).toBe(480400);
    expect(buy.fee).toBe(950);
    expect(buy.amount).toBe(buy.quantity! * buy.price!);
  });

  it("배당은 정산금액을 그대로 쓴다", () => {
    expect(s.events.find((e) => e.type === "DIVIDEND")).toMatchObject({
      date: "2026-10-02",
      amount: 44760,
      fee: 0,
    });
  });
});

describe("두 증권사 결과가 같은 모양인지", () => {
  it("같은 필드 집합을 낸다", () => {
    const a = parseKiwoom(KIWOOM);
    const b = parseKb(KB);
    expect(Object.keys(a).sort()).toEqual(
      Object.keys(b).filter((k) => k !== "accountLabel").sort(),
    );
  });
});

describe("detectBroker", () => {
  it("양식의 고유한 표제로 증권사를 가린다", () => {
    expect(detectBroker(KB)).toBe("KB증권");
    expect(detectBroker(KIWOOM)).toBe("키움증권");
  });

  it("둘 다 아니면 null — 엉뚱한 파서를 돌리지 않는다", () => {
    expect(detectBroker([["안녕하세요"], ["광고입니다"]])).toBeNull();
  });
});
