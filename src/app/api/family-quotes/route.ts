import { validDate } from "@/lib/family/model";
import { getBenchmarkMoves, getFamilyPrices } from "@/lib/family/quotes";
import { authorized, json, sameOrigin } from "@/lib/family/server";
export const maxDuration=60;
export async function POST(request:Request){
 if(!sameOrigin(request))return json({error:"요청 출처를 확인해 주세요."},403);
 if(!await authorized())return json({error:"비밀번호를 입력해 주세요."},401);
 try{
  if(Number(request.headers.get("content-length")||0)>4096)return Response.json({error:"요청이 너무 큽니다."},{status:413});
  const body=await request.json();
  if(!Array.isArray(body.symbols)||body.symbols.length<1||body.symbols.length>50||body.symbols.some((s:unknown)=>typeof s!=="string"||!/^[A-Za-z0-9.^=-]{1,20}$/.test(s)))return Response.json({error:"종목코드 1~50개를 입력해 주세요."},{status:400});
  const symbols=[...new Set(body.symbols as string[])];
  const bench=body.benchmarks;
  if(bench!==undefined&&(!bench||!Array.isArray(bench.ids)||bench.ids.length>10||bench.ids.some((s:unknown)=>typeof s!=="string"||!/^[A-Za-z0-9.^=-]{1,20}$/.test(s))||typeof bench.since!=="string"||!validDate(bench.since)))return Response.json({error:"비교 ETF 요청을 확인해 주세요."},{status:400});
  const [result,benchmarkMoves]=await Promise.all([getFamilyPrices(symbols),bench?getBenchmarkMoves([...new Set(bench.ids as string[])],bench.since):{}]);
  return Response.json({prices:result.prices,marketTimes:result.marketTimes,benchmarkMoves,checkedAt:new Date().toISOString(),missing:symbols.filter(s=>result.prices[s]==null)},{headers:{"Cache-Control":"no-store"}});
 }catch{return Response.json({error:"시세를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."},{status:502});}
}
