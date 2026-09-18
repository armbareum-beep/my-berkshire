type Quote={price:number;currency:string;marketTime:number};
async function quote(symbol:string):Promise<Quote|null>{
 try{const r=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,{headers:{"User-Agent":"Mozilla/5.0"},signal:AbortSignal.timeout(20000),next:{revalidate:60}});if(!r.ok)return null;const body=await r.json();if(body?.chart?.error)return null;const m=body?.chart?.result?.[0]?.meta;if(typeof m?.regularMarketPrice!=="number"||!Number.isFinite(m.regularMarketPrice)||m.regularMarketPrice<=0||typeof m.currency!=="string"||!/^[A-Z]{3}$/.test(m.currency))return null;return {price:m.regularMarketPrice,currency:m.currency,marketTime:Number.isFinite(m.regularMarketTime)?m.regularMarketTime:0};}catch{return null;}
}
export async function getFamilyPrices(symbols:string[]){
 const quotes:Record<string,Quote>={},prices:Record<string,number>={},marketTimes:Record<string,number>={};
 // Limit parallel requests. Missing quotes never become zero-price assets.
 let index=0;await Promise.all(Array.from({length:Math.min(symbols.length,6)},async()=>{while(index<symbols.length){const symbol=symbols[index++];const candidates=/^\d{6}$/.test(symbol)?await Promise.all([quote(symbol+".KS"),quote(symbol+".KQ")]):[await quote(symbol)];const best=candidates.filter((q):q is Quote=>q!==null).sort((a,b)=>b.marketTime-a.marketTime)[0];if(best)quotes[symbol]=best;}}));
 const fx:Record<string,number>={KRW:1};await Promise.all([...new Set(Object.values(quotes).map(q=>q.currency))].filter(c=>c!=="KRW").map(async currency=>{const q=await quote(currency+"KRW=X");if(q&&q.currency==="KRW")fx[currency]=q.price;}));
 for(const [symbol,q] of Object.entries(quotes)){if(fx[q.currency]){prices[symbol]=q.price*fx[q.currency];marketTimes[symbol]=q.marketTime;}}
 return {prices,marketTimes};
}
