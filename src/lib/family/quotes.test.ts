import {afterEach,describe,it,expect,vi} from "vitest";
import {getFamilyPrices} from "./quotes";
const quote=(price:unknown,currency="KRW",marketTime=100)=>({ok:true,json:async()=>({chart:{error:null,result:[{meta:{regularMarketPrice:price,currency,regularMarketTime:marketTime}}]}})});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
describe("시세 검증",()=>{
 it("국내 두 거래소 중 최신 가격",async()=>{vi.stubGlobal("fetch",vi.fn(async(u:string)=>u.includes(".KQ")?quote(120,"KRW",200):quote(100)));expect((await getFamilyPrices(["123456"])).prices).toEqual({"123456":120});});
 it("통화 없는 가격, 0원, 무한대 거부",async()=>{vi.stubGlobal("fetch",vi.fn(async(u:string)=>u.includes("BAD")?quote(100,""):u.includes("ZERO")?quote(0):quote(Infinity)));expect((await getFamilyPrices(["BAD","ZERO","INF"])).prices).toEqual({});});
 it("외화 환산 및 실패 시 누락",async()=>{vi.stubGlobal("fetch",vi.fn(async(u:string)=>u.includes("USDKRW")?quote(1300):u.includes("AAPL")?quote(10,"USD"):quote(10,"EUR")));const p=await getFamilyPrices(["AAPL"]);expect(p.prices.AAPL).toBe(13000);});
 it("엔화 환율 상품은 원/1엔 가격 그대로 사용",async()=>{const fetch=vi.fn(async()=>quote(8.65,"KRW",200));vi.stubGlobal("fetch",fetch);const p=await getFamilyPrices(["JPYKRW=X"]);expect(p.prices).toEqual({"JPYKRW=X":8.65});expect(fetch).toHaveBeenCalledTimes(1);});
});
