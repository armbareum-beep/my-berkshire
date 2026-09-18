import { emptyPortfolio, validatePortfolio, type Portfolio } from "./model";
type Row=Record<string,string>;
function numeric(v:string|undefined){if(v===undefined||v.trim()==="")throw Error("필수 숫자가 비어 있습니다. 엑셀을 다시 계산하고 저장해 주세요.");const n=Number(v.replaceAll(",",""));if(!Number.isFinite(n))throw Error("숫자 형식을 확인해 주세요: "+v);return n;}
function date(v:string){return /^\d{4}-\d{2}-\d{2}$/.test(v)?v:new Date((numeric(v)-25569)*86400000).toISOString().slice(0,10);}
export function parseCsv(text:string): string[][] {
 const rows:string[][]=[];let row:string[]=[],value="",quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(c===","&&!quoted){row.push(value);value="";}else if((c==="\n"||c==="\r")&&!quoted){if(c==="\r"&&text[i+1]==="\n")i++;row.push(value);if(row.some(v=>v.trim()))rows.push(row);row=[];value="";}else value+=c;}
 if(quoted)throw Error("CSV 따옴표가 닫히지 않았습니다.");row.push(value);if(row.some(v=>v.trim()))rows.push(row);return rows;
}
export function fromCsv(text:string): Portfolio {
 const rows=parseCsv(text.replace(/^\uFEFF/,"")),headers=rows.shift()||[];
 const required=["기준일","계좌주","증권사","계좌명","계좌유형","현금","종목코드","상품명","수량","매입원가","원화가격","한국비중","중국비중","미국비중","기타비중","채권비중"];
 if(required.some(h=>!headers.includes(h))||!rows.length)throw Error("지원하는 표준 CSV 열이 아닙니다. 화면 하단의 지원 파일 안내를 확인해 주세요.");
 const p=emptyPortfolio();p.owners=[];
 for(const cells of rows){const r=Object.fromEntries(headers.map((h,i)=>[h,cells[i]?.trim()||""]));if(!p.accounts.length)p.asOf=r["기준일"];if(r["기준일"]!==p.asOf)throw Error("한 파일의 자료 기준일은 같아야 합니다.");let owner=p.owners.find(o=>o.name===r["계좌주"]);if(!owner){owner={id:"owner:"+r["계좌주"],name:r["계좌주"]};p.owners.push(owner);}const id=[owner.id,r["증권사"],r["계좌명"]].join(":");const cash=numeric(r["현금"]),found=p.accounts.find(a=>a.id===id);if(found&&found.cash!==cash)throw Error("같은 계좌의 현금 금액이 서로 다릅니다.");if(!found)p.accounts.push({id,owner:owner.id,broker:r["증권사"],name:r["계좌명"],type:r["계좌유형"],mask:"",cash,complete:false,div:0,interest:0,realized:0});if(!r["종목코드"]){if(r["수량"]&&numeric(r["수량"])!==0)throw Error("종목코드가 없는 보유상품입니다.");continue;}const code=r["종목코드"].toUpperCase();const product={name:r["상품명"],price:r["원화가격"]?numeric(r["원화가격"]):null,exposure:["한국비중","중국비중","미국비중","기타비중","채권비중"].map(k=>numeric(r[k])/100)};if(p.products[code]&&JSON.stringify(p.products[code])!==JSON.stringify(product))throw Error("같은 종목의 가격·분류가 서로 다릅니다.");p.products[code]=product;p.holdings.push({account:id,code,quantity:numeric(r["수량"]),cost:numeric(r["매입원가"])});}
 return validatePortfolio(p);
}
/** Small, read-only OOXML reader. Never executes macros, formulas, or external links. */
async function unzip(buffer:ArrayBuffer):Promise<Map<string,string>>{
 const view=new DataView(buffer),bytes=new Uint8Array(buffer),decode=new TextDecoder(),out=new Map<string,string>();
 let eocd=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){eocd=i;break;}
 if(eocd<0)throw Error("암호화되지 않은 .xlsx 파일을 사용해 주세요.");
 const count=view.getUint16(eocd+10,true);let offset=view.getUint32(eocd+16,true),total=0;
 if(count>500)throw Error("엑셀 내부 파일이 너무 많습니다.");
 for(let i=0;i<count;i++){
  if(view.getUint32(offset,true)!==0x02014b50)throw Error("엑셀 압축 구조가 올바르지 않습니다.");
  const flags=view.getUint16(offset+8,true),method=view.getUint16(offset+10,true),size=view.getUint32(offset+20,true),unpacked=view.getUint32(offset+24,true),len=view.getUint16(offset+28,true),extra=view.getUint16(offset+30,true),comment=view.getUint16(offset+32,true),local=view.getUint32(offset+42,true);
  const name=decode.decode(bytes.slice(offset+46,offset+46+len));offset+=46+len+extra+comment;
  if(flags&1)throw Error("암호를 해제한 엑셀 파일을 사용해 주세요.");
  total+=unpacked;if(total>30_000_000)throw Error("엑셀의 압축 해제 크기가 너무 큽니다.");
  if(!name.startsWith("xl/")||!name.endsWith(".xml")&&!name.endsWith(".rels"))continue;
  const start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true),chunk=bytes.slice(start,start+size);
  if(method===0)out.set(name,decode.decode(chunk));else if(method===8){const stream=new Blob([chunk]).stream().pipeThrough(new DecompressionStream("deflate-raw"));const reader=stream.getReader(),parts:Uint8Array[]=[];let read=0;while(true){const {done,value}=await reader.read();if(done)break;read+=value.length;if(read>unpacked||read>30_000_000){await reader.cancel();throw Error("엑셀 크기 검증에 실패했습니다.");}parts.push(value);}out.set(name,await new Blob(parts as BlobPart[]).text());}else throw Error("지원하지 않는 엑셀 압축 방식입니다.");
 }
 return out;
}
function xml(text:string|undefined){if(!text)throw Error("엑셀의 필수 시트가 없습니다.");const d=new DOMParser().parseFromString(text,"application/xml");if(d.querySelector("parsererror"))throw Error("엑셀 XML을 읽지 못했습니다.");return d;}
export async function readXlsx(buffer:ArrayBuffer):Promise<Portfolio>{
 const files=await unzip(buffer),book=xml(files.get("xl/workbook.xml")),rels=xml(files.get("xl/_rels/workbook.xml.rels"));
 if(book.querySelector("workbookPr")?.getAttribute("date1904")==="1")throw Error("1904 날짜 체계는 지원하지 않습니다.");
 const ss=files.get("xl/sharedStrings.xml"),strings=ss?[...xml(ss).getElementsByTagName("si")].map(s=>s.textContent||""):[];
 const sheets:Record<string,Row[]>={};
 for(const sheet of book.getElementsByTagName("sheet")){
  const id=sheet.getAttribute("r:id"),rel=[...rels.getElementsByTagName("Relationship")].find(r=>r.getAttribute("Id")===id),target=rel?.getAttribute("Target")||"",path=target.startsWith("/")?target.slice(1):"xl/"+target;
  sheets[sheet.getAttribute("name")||""]=[...xml(files.get(path)).getElementsByTagName("row")].map(row=>Object.fromEntries([...row.getElementsByTagName("c")].map(c=>{const type=c.getAttribute("t"),raw=c.getElementsByTagName("v")[0]?.textContent||"",value=type==="s"?strings[Number(raw)]:type==="inlineStr"?c.getElementsByTagName("is")[0]?.textContent||"":raw;return [(c.getAttribute("r")||"").replace(/\d/g,""),value];})));
 }
 return fromWorkbookRows(sheets);
}
export function fromWorkbookRows(sheets:Record<string,Row[]>):Portfolio{
 for(const key of ["계좌관리","보유자산","시세배분","현금흐름"])if(!sheets[key])throw Error("가족자산 대시보드 엑셀 양식이 아닙니다. 증권사 원본은 변환 후 불러와 주세요.");
 const p=emptyPortfolio(),aRows=sheets["계좌관리"],ownerHeader=aRows.findIndex(r=>r.A==="계좌주ID");if(ownerHeader<0)throw Error("계좌주 목록이 없습니다.");
 p.owners=aRows.slice(ownerHeader+1).filter(r=>r.A&&r.B&&r.C).map(r=>({id:r.A,name:r.B}));
 p.accounts=aRows.filter(r=>p.owners.some(o=>o.id===r.B)&&r.A&&r.C).map(r=>({id:r.A,owner:r.B,broker:r.C,name:r.D,type:r.D,mask:r.E||"",cash:numeric(r.I),complete:r.H==="반영",div:numeric(r.O),interest:numeric(r.P),realized:0}));
 if(!p.accounts.length)throw Error("등록된 계좌가 없는 엑셀입니다.");
 const ends=aRows.filter(r=>p.accounts.some(a=>a.id===r.A)).map(r=>date(r.G));if(new Set(ends).size!==1)throw Error("계좌별 조회종료일이 다릅니다. 기준일을 맞춰 주세요.");p.asOf=ends[0];
 const keys:Record<string,string>={};
 for(const r of sheets["시세배분"].filter(r=>r.A&&r.C&&/^[A-Za-z0-9.^=-]{1,20}$/.test(r.C))){const code=/^\d+$/.test(r.C)?r.C.padStart(6,"0"):r.C;keys[r.A]=code;p.products[code]={name:r.B,price:r.D?numeric(r.D):null,exposure:[r.F,r.G,r.H,r.I,r.J].map(numeric),source:r.M};if(Number(r.K||0)!==0)throw Error("기타자산이 포함된 상품은 현재 지원하는 주식·채권 분류로 변환해 주세요.");}
 for(const r of sheets["보유자산"].filter(r=>p.accounts.some(a=>a.id===r.A))){const a=p.accounts.find(a=>a.id===r.A)!;a.realized+=r.K?numeric(r.K):0;if(numeric(r.D)>0){if(!keys[r.C])throw Error("시세배분에 없는 상품입니다: "+r.C);p.holdings.push({account:r.A,code:keys[r.C],quantity:numeric(r.D),cost:numeric(r.F)});}}
 p.flows=sheets["현금흐름"].filter(r=>r.A&&r.A!=="기말평가"&&p.accounts.some(a=>a.id===r.C)).map(r=>({id:r.A,account:r.C,date:date(r.B),amount:numeric(r.E),...(r.F?{transfer:r.F}:{})}));
 const targetRows=sheets["대시보드"]?.filter(r=>["한국","중국","미국","기타"].includes(r.A)&&r.D);
 if(targetRows?.length===4)p.targets=["한국","중국","미국","기타"].map(c=>numeric(targetRows.find(r=>r.A===c)!.D)*100);
 return validatePortfolio(p);
}
export async function readPortfolioFile(file:File):Promise<Portfolio>{
 if(file.name.toLowerCase().endsWith(".json"))return validatePortfolio(JSON.parse(await file.text()));
 if(file.name.toLowerCase().endsWith(".csv"))return fromCsv(await file.text());
 if(file.name.toLowerCase().endsWith(".xlsx"))return readXlsx(await file.arrayBuffer());
 throw Error("지원 형식: 가족자산 .xlsx, 백업 .json, 표준 .csv");
}
