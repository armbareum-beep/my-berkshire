import type { NativeQuote } from "./valuation-alerts";
import { readQuoteSessions } from "./quote-session";
type Quote=NativeQuote;
const exchangeNames:Record<string,string>={NYQ:"NYSE",NYSE:"NYSE",NMS:"NASDAQ",NGM:"NASDAQ",NCM:"NASDAQ",NASDAQ:"NASDAQ",TOR:"TSX",TSX:"TSX",KSC:"KRX",KOE:"KRX",KOS:"KRX",KOSDAQ:"KRX",HKG:"HKEX",SHH:"SSE",SHZ:"SZSE",JPX:"TSE",TYO:"TSE",LSE:"LSE"};
async function quote(symbol:string):Promise<Quote|null>{
 try{const r=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1h&range=5d&includePrePost=false`,{headers:{"User-Agent":"Mozilla/5.0"},signal:AbortSignal.timeout(20000),next:{revalidate:60}});if(!r.ok)return null;const body=await r.json();if(body?.chart?.error)return null;const m=body?.chart?.result?.[0]?.meta;if(typeof m?.regularMarketPrice!=="number"||!Number.isFinite(m.regularMarketPrice)||m.regularMarketPrice<=0||typeof m.currency!=="string"||!/^[A-Z]{3}$/.test(m.currency))return null;return {price:m.regularMarketPrice,currency:m.currency,marketTime:Number.isFinite(m.regularMarketTime)?m.regularMarketTime:0,symbol:typeof m.symbol==="string"?m.symbol:"",exchange:exchangeNames[m.exchangeName]||"",unit:m.instrumentType==="EQUITY"?"share":"other",...readQuoteSessions(m)};}catch{return null;}
}
/** Price move from the close on `since` (or the last trading day before it) to now. Distributions after `since` are not included. */
async function move(symbol:string,since:string):Promise<{ratio:number;marketTime:number}|null>{
 try{const from=Math.floor(Date.parse(since)/1000)-14*86400;const r=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${from}&period2=${Math.floor(Date.now()/1000)}`,{headers:{"User-Agent":"Mozilla/5.0"},signal:AbortSignal.timeout(20000),next:{revalidate:300}});if(!r.ok)return null;const body=await r.json();const res=body?.chart?.result?.[0],m=res?.meta,ts:unknown=res?.timestamp,closes:unknown=res?.indicators?.quote?.[0]?.close;if(typeof m?.regularMarketPrice!=="number"||!(m.regularMarketPrice>0)||!Number.isFinite(m.regularMarketPrice)||!Array.isArray(ts)||!Array.isArray(closes))return null;const offset=Number.isFinite(m.gmtoffset)?m.gmtoffset:0;let base=0;ts.forEach((t,i)=>{const c=closes[i];if(typeof t==="number"&&typeof c==="number"&&c>0&&new Date((t+offset)*1000).toISOString().slice(0,10)<=since)base=c;});return base>0?{ratio:m.regularMarketPrice/base,marketTime:Number.isFinite(m.regularMarketTime)?m.regularMarketTime:0}:null;}catch{return null;}
}
/** Benchmark ETF growth factors since the last daily close, keyed by benchmark id. */
export async function getBenchmarkMoves(ids:string[],since:string){
 const moves:Record<string,number>={};
 await Promise.all(ids.map(async id=>{const candidates=/^\d{6}$/.test(id)?await Promise.all([move(id+".KS",since),move(id+".KQ",since)]):[await move(id,since)];const best=candidates.filter((q):q is {ratio:number;marketTime:number}=>q!==null).sort((a,b)=>b.marketTime-a.marketTime)[0];if(best)moves[id]=best.ratio;}));
 return moves;
}
export async function getFamilyPrices(symbols:string[]){
 const quotes:Record<string,Quote>={},prices:Record<string,number>={},marketTimes:Record<string,number>={};
 // Limit parallel requests. Missing quotes never become zero-price assets.
 let index=0;await Promise.all(Array.from({length:Math.min(symbols.length,6)},async()=>{while(index<symbols.length){const symbol=symbols[index++];const candidates=/^\d{6}$/.test(symbol)?await Promise.all([quote(symbol+".KS"),quote(symbol+".KQ")]):[await quote(symbol)];const best=candidates.filter((q):q is Quote=>q!==null).sort((a,b)=>b.marketTime-a.marketTime)[0];if(best)quotes[symbol]=best;}}));
 const fx:Record<string,number>={KRW:1};await Promise.all([...new Set(Object.values(quotes).map(q=>q.currency))].filter(c=>c!=="KRW").map(async currency=>{const q=await quote(currency+"KRW=X");if(q&&q.currency==="KRW")fx[currency]=q.price;}));
 for(const [symbol,q] of Object.entries(quotes)){if(fx[q.currency]){prices[symbol]=q.price*fx[q.currency];marketTimes[symbol]=q.marketTime;}}
 return {prices,marketTimes,rawQuotes:quotes};
}
