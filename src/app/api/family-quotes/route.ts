import { getFamilyPrices } from "@/lib/family/quotes";
export const maxDuration=60;
export async function POST(request:Request){
 try{
  if(Number(request.headers.get("content-length")||0)>4096)return Response.json({error:"요청이 너무 큽니다."},{status:413});
  const body=await request.json();
  if(!Array.isArray(body.symbols)||body.symbols.length<1||body.symbols.length>50||body.symbols.some((s:unknown)=>typeof s!=="string"||!/^[A-Za-z0-9.^=-]{1,20}$/.test(s)))return Response.json({error:"종목코드 1~50개를 입력해 주세요."},{status:400});
  const symbols=[...new Set(body.symbols as string[])];
  const result=await getFamilyPrices(symbols);
  return Response.json({prices:result.prices,marketTimes:result.marketTimes,checkedAt:new Date().toISOString(),missing:symbols.filter(s=>result.prices[s]==null)},{headers:{"Cache-Control":"no-store"}});
 }catch{return Response.json({error:"시세를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."},{status:502});}
}
