import {afterEach,describe,it,expect,vi} from "vitest";
import {getBenchmarkMoves,getBenchmarkQuotes,getFamilyPrices} from "./quotes";
const quote=(price:unknown,currency="KRW",marketTime=100)=>({ok:true,json:async()=>({chart:{error:null,result:[{meta:{regularMarketPrice:price,currency,regularMarketTime:marketTime}}]}})});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
describe("시세 검증",()=>{
 it("비교 ETF는 연초부터 현재까지 조정종가로 계산하고 실제 거래일을 반환",async()=>{
  const day=(d:string)=>Date.parse(d+"T06:00:00Z")/1000;
  vi.stubGlobal("fetch",vi.fn(async(u:string)=>u.includes("MISSING")?{ok:false}:{ok:true,json:async()=>({chart:{result:[{
   meta:{symbol:"379800.KS",regularMarketPrice:120,currency:"KRW",regularMarketTime:day("2026-10-29"),gmtoffset:32400},
   timestamp:[day("2025-12-30"),day("2026-10-29")],indicators:{quote:[{close:[100,120]}],adjclose:[{adjclose:[98,120]}]},
  }]}})}));
  const result=await getBenchmarkQuotes(["379800","MISSING"],"2025-12-31");
  expect(result["379800"].return).toBeCloseTo(120/98-1,10);
  expect(result["379800"]).toMatchObject({start:"2025-12-31",asOf:"2026-10-29",currency:"KRW",totalReturn:true});
  expect(result.MISSING).toBeUndefined();
 });
 it("국내 두 거래소 중 최신 가격",async()=>{vi.stubGlobal("fetch",vi.fn(async(u:string)=>u.includes(".KQ")?quote(120,"KRW",200):quote(100)));expect((await getFamilyPrices(["123456"])).prices).toEqual({"123456":120});});
 it("통화 없는 가격, 0원, 무한대 거부",async()=>{vi.stubGlobal("fetch",vi.fn(async(u:string)=>u.includes("BAD")?quote(100,""):u.includes("ZERO")?quote(0):quote(Infinity)));expect((await getFamilyPrices(["BAD","ZERO","INF"])).prices).toEqual({});});
 it("외화 환산 및 실패 시 누락",async()=>{vi.stubGlobal("fetch",vi.fn(async(u:string)=>u.includes("USDKRW")?quote(1300):u.includes("AAPL")?quote(10,"USD"):quote(10,"EUR")));const p=await getFamilyPrices(["AAPL"]);expect(p.prices.AAPL).toBe(13000);});
 it("비교 ETF는 기준일 종가(휴장이면 그 전 거래일) 대비 현재가 변동",async()=>{
  // 2026-09-16, 09-17 (KST 날짜), 09-18 종가. 기준일 09-17 → 110, 현재가 121.
  const day=(d:string)=>Date.parse(d+"T00:00:00Z")/1000;
  const chart=(closes:number[])=>({ok:true,json:async()=>({chart:{error:null,result:[{meta:{regularMarketPrice:121,currency:"KRW",regularMarketTime:300,gmtoffset:32400},timestamp:[day("2026-09-16"),day("2026-09-17"),day("2026-09-18")],indicators:{quote:[{close:closes}]}}]}})});
  vi.stubGlobal("fetch",vi.fn(async(u:string)=>u.includes(".KS")?chart([100,110,115]):{ok:false}));
  expect(await getBenchmarkMoves(["226490"],"2026-09-17")).toEqual({"226490":1.1});
  expect((await getBenchmarkMoves(["226490"],"2026-09-15")))
   .toEqual({});
 });
 it("엔화 환율 상품은 원/1엔 가격 그대로 사용",async()=>{const fetch=vi.fn(async()=>quote(8.65,"KRW",200));vi.stubGlobal("fetch",fetch);const p=await getFamilyPrices(["JPYKRW=X"]);expect(p.prices).toEqual({"JPYKRW=X":8.65});expect(fetch).toHaveBeenCalledTimes(1);});
 it("원시 USD/CAD 시세는 원화 평가와 분리하고 FX 실패에도 유지",async()=>{
  vi.stubGlobal("fetch",vi.fn(async(u:string)=>{
   if(u.includes("KRW=X"))return {ok:false};
   const ffh=u.includes("FFH.TO");
   return {ok:true,json:async()=>({chart:{result:[{meta:{regularMarketPrice:ffh?200:100,currency:ffh?"CAD":"USD",symbol:ffh?"FFH.TO":"BRK-B",exchangeName:ffh?"TOR":"NYQ",instrumentType:"EQUITY",regularMarketTime:12345}}]}})};
  }));
  const result=await getFamilyPrices(["BRK-B","FFH.TO"]);
  expect(result.prices).toEqual({});
  expect(result.rawQuotes["BRK-B"]).toEqual({symbol:"BRK-B",exchange:"NYSE",currency:"USD",price:100,marketTime:12345,unit:"share"});
  expect(result.rawQuotes["FFH.TO"]).toMatchObject({exchange:"TSX",currency:"CAD",price:200});
 });
 it("지수·시세시각 누락·다른 종목 반환을 원시 관측에서 숨기지 않음",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>({chart:{result:[{meta:{regularMarketPrice:100,currency:"KRW",symbol:"OTHER",exchangeName:"UNKNOWN",instrumentType:"INDEX"}}]}})})));
  expect((await getFamilyPrices(["TEST"])).rawQuotes.TEST).toEqual({symbol:"OTHER",exchange:"",currency:"KRW",price:100,marketTime:0,unit:"other"});
 });
});
