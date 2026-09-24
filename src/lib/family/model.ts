export type Owner = { id: string; name: string };
export type Account = { id: string; owner: string; broker: string; name: string; type: string; mask: string; cash: number; complete: boolean; div: number; interest: number; realized: number; divGross?: number; divTax?: number; interestGross?: number; interestTax?: number; valuationDate?: string; cashLabel?: string; interestKnown?: boolean; inceptionDate?: string };
export type Product = { name: string; price: number | null; exposure: number[]; source?: string };
export type Position = { account: string; code: string; quantity: number; cost: number };
export type Flow = { id: string; account: string; date: string; amount: number; transfer?: string };
export type Valuation = { account: string; date: string; value: number; estimated: boolean; note?: string };
export type Income = { account: string; date: string; dividend: number; interest: number };
export type Performance = { start: string; end: string; method: "daily-eod-estimate"; daily?: { date: string; values: Record<string, number> }[]; income?: Income[]; incomeAccounts?: string[]; benchmarks: { id: string; name: string; return: number; source?: string }[]; note: string };
export type Portfolio = { version: 1; asOf: string; owners: Owner[]; accounts: Account[]; products: Record<string, Product>; holdings: Position[]; flows: Flow[]; targets: number[]; checkedAt?: string; pricedAt?: string; valuations?: Valuation[]; performance?: Performance };
export const countries = ["한국", "중국", "미국", "기타"];
export const colors = ["#4165e8", "#26a69a", "#a67bdd", "#a3aec2"];
export function emptyPortfolio(): Portfolio {
  return { version: 1, asOf: new Date().toISOString().slice(0, 10), owners: [{id:"P01",name:"본인"},{id:"P02",name:"아내"},{id:"P03",name:"첫째 딸"},{id:"P04",name:"둘째 딸"}], accounts: [], products: {}, holdings: [], flows: [], targets: [50,50,0,0] };
}
export function validDate(v: string) { return /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v; }
function check(ok: unknown, message: string): asserts ok { if (!ok) throw Error(message); }
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e15;
const str = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 160;
const incomeAmountsMatch = (net: number, gross?: number, tax?: number) =>
  (gross === undefined && tax === undefined) ||
  (gross !== undefined && tax !== undefined && tax <= gross && Math.abs(gross - tax - net) <= 1);
export function validatePortfolio(input: unknown): Portfolio {
  check(input && typeof input === "object", "올바른 자산 파일이 아닙니다.");
  const p = input as Portfolio;
  check(p.version === 1 && validDate(p.asOf), "자료 버전과 기준일을 확인해 주세요.");
  check(Array.isArray(p.owners) && Array.isArray(p.accounts) && Array.isArray(p.holdings) && Array.isArray(p.flows), "계좌·보유상품·입출금 자료가 필요합니다.");
  check(p.owners.length <= 100 && p.accounts.length <= 500 && p.holdings.length <= 10000 && p.flows.length <= 50000, "가져올 수 있는 자료 크기를 초과했습니다.");
  check(p.owners.every(o=>str(o.id)&&str(o.name)) && new Set(p.owners.map(o=>o.id)).size === p.owners.length, "가족 ID가 중복되거나 이름이 비어 있습니다.");
  check(p.accounts.every(a=>str(a.id)&&str(a.name)&&str(a.broker)&&p.owners.some(o=>o.id===a.owner)&&num(a.cash)&&typeof a.complete==="boolean"&&[a.div,a.interest,a.realized].every(num)), "계좌주·계좌명·금액을 확인해 주세요.");
  check(p.accounts.every(a=>(!a.valuationDate||(validDate(a.valuationDate)&&a.valuationDate<=p.asOf))&&(a.interestKnown===undefined||typeof a.interestKnown==="boolean")&&(!a.cashLabel||str(a.cashLabel))&&[a.divGross,a.divTax,a.interestGross,a.interestTax].every(v=>v===undefined||(num(v)&&v>=0))), "계좌 잔고 기준일과 세전·세금 금액을 확인해 주세요.");
  check(p.accounts.every(a=>incomeAmountsMatch(a.div,a.divGross,a.divTax)&&incomeAmountsMatch(a.interest,a.interestGross,a.interestTax)), "세전 금액에서 세금을 뺀 값이 세후 금액과 일치하는지 확인해 주세요.");
  check(p.accounts.every(a=>!a.inceptionDate||(validDate(a.inceptionDate)&&a.inceptionDate<=p.asOf)), "계좌 시작일을 확인해 주세요.");
  check(new Set(p.accounts.map(a=>a.id)).size===p.accounts.length, "계좌 ID가 중복되었습니다.");
  check(p.products && typeof p.products === "object" && !Array.isArray(p.products), "상품 정보가 필요합니다.");
  check(Object.entries(p.products).every(([code,v])=>/^[A-Za-z0-9.^=-]{1,20}$/.test(code)&&str(v.name)&&(v.price===null||(num(v.price)&&v.price>0))&&Array.isArray(v.exposure)&&v.exposure.length===5&&v.exposure.every(n=>num(n)&&n>=0&&n<=1)&&Math.abs(v.exposure.reduce((a,b)=>a+b,0)-1)<1e-6), "상품 가격과 국가·채권 비중 합계(100%)를 확인해 주세요.");
  check(p.holdings.every(h=>p.accounts.some(a=>a.id===h.account)&&Object.hasOwn(p.products,h.code)&&num(h.quantity)&&h.quantity>0&&num(h.cost)&&h.cost>=0), "보유상품의 계좌·코드·수량·원가를 확인해 주세요.");
  check(new Set(p.holdings.map(h=>h.account+":"+h.code)).size===p.holdings.length, "같은 계좌에 동일한 보유상품이 중복되었습니다.");
  check(p.flows.every(f=>str(f.id)&&p.accounts.some(a=>a.id===f.account)&&validDate(f.date)&&f.date<=p.asOf&&num(f.amount)&&f.amount!==0&&(!f.transfer||str(f.transfer))), "입출금 날짜·금액을 확인해 주세요. 기준일 이후 거래는 포함할 수 없습니다.");
  check(new Set(p.flows.map(f=>f.id)).size===p.flows.length, "입출금 ID가 중복되었습니다.");
  for(const id of new Set(p.flows.map(f=>f.transfer).filter(Boolean))) {
    const pair=p.flows.filter(f=>f.transfer===id);
    check(pair.length===2&&pair[0].account!==pair[1].account&&pair[0].date===pair[1].date&&Math.abs(pair[0].amount+pair[1].amount)<.01, "내부이체는 같은 날짜의 출금·입금 두 건이 일치해야 합니다.");
  }
  check(Array.isArray(p.targets)&&p.targets.length===4&&p.targets.every(n=>num(n)&&n>=0&&n<=100)&&Math.abs(p.targets.reduce((a,b)=>a+b,0)-100)<.001,"국가 목표비중 합계를 100%로 맞춰 주세요.");
  if(p.valuations!==undefined) {
    check(Array.isArray(p.valuations)&&p.valuations.length<=10000, "연말 자산 자료를 확인해 주세요.");
    check(p.valuations.every(v=>p.accounts.some(a=>a.id===v.account)&&validDate(v.date)&&v.date<=p.asOf&&num(v.value)&&v.value>=0&&typeof v.estimated==="boolean"&&(!v.note||(typeof v.note==="string"&&v.note.length<=1000))), "연말 자산의 계좌·날짜·금액을 확인해 주세요.");
    check(new Set(p.valuations.map(v=>v.account+":"+v.date)).size===p.valuations.length, "연말 자산 자료가 중복됩니다.");
  }
  if(p.performance!==undefined) {
    const q=p.performance;
    check(q&&q.method==="daily-eod-estimate"&&validDate(q.start)&&validDate(q.end)&&q.start<q.end&&q.end<=p.asOf,"운용성과 기간을 확인해 주세요.");
    if(q.daily!==undefined) {
      const daily=q.daily;
      check(Array.isArray(daily)&&daily.length>=2&&daily.length<=10000&&daily[0].date===q.start&&daily[daily.length-1].date===q.end,"일별 평가자료의 범위를 확인해 주세요.");
      check(daily.every((d,i)=>validDate(d.date)&&(!i||Date.parse(d.date)-Date.parse(daily[i-1].date)===86400000)&&d.values&&typeof d.values==="object"&&!Array.isArray(d.values)&&Object.entries(d.values).every(([id,v])=>p.accounts.some(a=>a.id===id)&&num(v)&&v>=0)),"일별 평가자료의 날짜·계좌·금액을 확인해 주세요.");
    }
    if(q.income!==undefined) check(Array.isArray(q.income)&&q.income.length<=50000&&q.income.every(v=>p.accounts.some(a=>a.id===v.account)&&validDate(v.date)&&v.date>q.start&&v.date<=q.end&&num(v.dividend)&&v.dividend>=0&&num(v.interest)&&v.interest>=0),"배당·이자 자료의 계좌·날짜·금액을 확인해 주세요.");
    if(q.incomeAccounts!==undefined) check(Array.isArray(q.incomeAccounts)&&q.incomeAccounts.length<=p.accounts.length&&q.incomeAccounts.every(id=>p.accounts.some(a=>a.id===id))&&new Set(q.incomeAccounts).size===q.incomeAccounts.length,"배당·이자 확인 완료 계좌를 확인해 주세요.");
    check(Array.isArray(q.benchmarks)&&q.benchmarks.length<=10&&q.benchmarks.every(b=>str(b.id)&&str(b.name)&&num(b.return)&&b.return>=-1)&&new Set(q.benchmarks.map(b=>b.id)).size===q.benchmarks.length&&typeof q.note==="string"&&q.note.length<=2000,"비교 기준 자료를 확인해 주세요.");
  }
  check(!p.pricedAt||validDate(p.pricedAt),"시세 평가일을 확인해 주세요.");
  return p;
}
/** Aggregate same-day cash flows first; report null for ambiguous / unbracketed roots. */
export function xirr(entries: {date:string;amount:number}[]): number | null {
  const days=new Map<string,number>();
  for(const f of entries){if(!validDate(f.date)||!num(f.amount))return null;days.set(f.date,(days.get(f.date)||0)+f.amount);}
  const sorted=[...days].filter(([,v])=>Math.abs(v)>1e-8).sort(([a],[b])=>a.localeCompare(b));
  if(sorted.length<2||!sorted.some(([,v])=>v<0)||!sorted.some(([,v])=>v>0))return null;
  const t0=Date.parse(sorted[0][0]),scale=Math.max(...sorted.map(([,v])=>Math.abs(v)));
  const npv=(y:number)=>sorted.reduce((s,[d,v])=>s+(v/scale)*Math.exp(-y*(Date.parse(d)-t0)/86400000/365),0);
  const roots:number[]=[];
  let lo=-14, flo=npv(lo);
  for(let i=1;i<=520;i++){
    const hi=-14+i*.05,fhi=npv(hi);
    if(Math.abs(fhi)<1e-12)roots.push(hi);
    else if(flo*fhi<0){let a=lo,b=hi,fa=flo;for(let k=0;k<100;k++){const m=(a+b)/2,fm=npv(m);if(fa*fm<=0)b=m;else{a=m;fa=fm;}}roots.push((a+b)/2);}
    lo=hi;flo=fhi;
  }
  const unique=roots.filter((r,i)=>i===0||Math.abs(r-roots[i-1])>1e-6);
  return unique.length===1?Math.expm1(unique[0]):null;
}
export function summarize(p:Portfolio,owner="all",account="all",broker="all") {
  const selected=p.accounts.filter(a=>(owner==="all"||a.owner===owner)&&(account==="all"||a.id===account)&&(broker==="all"||a.broker===broker));
  const ids=new Set(selected.map(a=>a.id));
  const positions=p.holdings.filter(h=>ids.has(h.account)).map(h=>({...h,...p.products[h.code],value:p.products[h.code].price===null?null:h.quantity*p.products[h.code].price!,profit:p.products[h.code].price===null?null:h.quantity*p.products[h.code].price!-h.cost})).sort((a,b)=>(b.value??0)-(a.value??0));
  const movements=p.flows.filter(f=>ids.has(f.account));
  const external=movements.filter(f=>!f.transfer||!p.flows.some(g=>g.id!==f.id&&g.transfer===f.transfer&&ids.has(g.account)));
  const cash=selected.reduce((s,a)=>s+a.cash,0),market=positions.reduce((s,h)=>s+(h.value??0),0),nav=cash+market;
  const missing=positions.filter(h=>h.value===null).length;
  const exposure=Array.from({length:5},(_,i)=>positions.reduce((s,h)=>s+(h.value??0)*h.exposure[i],0));
  const equity=exposure.slice(0,4).reduce((a,b)=>a+b,0),net=-external.reduce((s,f)=>s+f.amount,0);
  const complete=selected.length>0&&selected.every(a=>a.complete)&&!missing;
  const terminal=p.pricedAt||p.asOf;
  return {selected,positions,movements,external,cash,nav,market,net,missing,complete,exposure,equity,profit:complete?nav-net:null,xirr:complete?xirr([...external,{date:terminal,amount:nav}]):null};
}
export function mergePortfolio(current:Portfolio,incoming:Portfolio): Portfolio {
  if(!current.accounts.length)return validatePortfolio(incoming);
  check(current.asOf===incoming.asOf,"자료 기준일이 다릅니다. 전체 복원으로 불러오거나 기준일을 맞춰 주세요.");
  const map=incoming.accounts.map(a=>a.id);
  const overlap=current.accounts.some(a=>map.includes(a.id));
  check(!overlap,"이미 등록된 계좌 ID가 있습니다. 중복 집계를 막기 위해 추가하지 않았습니다. 전체 복원을 사용해 주세요.");
  for(const [code,product] of Object.entries(incoming.products))if(current.products[code])check(JSON.stringify(current.products[code])===JSON.stringify(product),"동일 상품의 가격·분류가 다릅니다. 자료를 맞춘 후 추가해 주세요.");
  for(const o of incoming.owners)if(current.owners.some(v=>v.id===o.id))check(current.owners.find(v=>v.id===o.id)!.name===o.name,"가족 ID의 이름이 다릅니다. 계좌주를 확인해 주세요.");
  return validatePortfolio({...current,owners:[...current.owners,...incoming.owners.filter(o=>!current.owners.some(v=>v.id===o.id))],accounts:[...current.accounts,...incoming.accounts],products:{...current.products,...incoming.products},holdings:[...current.holdings,...incoming.holdings],flows:[...current.flows,...incoming.flows],checkedAt:undefined,pricedAt:undefined});
}
