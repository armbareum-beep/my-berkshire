/**
 * DART(OpenDART) 연동 — 한국 종목 공시·재무제표.
 *
 * 인터페이스 seam: 토스 API 승인 시 이 파일만 교체(공시/펀더멘털 소스 추상화).
 * 키는 .env.local(OPENDART_API_KEY) — 절대 커밋·노출 금지.
 *
 * 공시(list.json)는 DART 고유번호(corp_code)로 조회한다. stock_code(6자리)→corp_code
 * 매핑은 corpCode.xml(전체 기업 zip)을 한 번 받아 파싱·메모이즈한다(서버 인스턴스 단위).
 *
 * V1 = 공시 피드. 재무제표(fnlttSinglAcntAll)·투시 펀더멘털은 후속.
 */

import zlib from "node:zlib";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../supabase/database.types";
import {
  getFundamentalsUS,
  getFundamentalsSeriesUS,
  getTtmFundamentalsUS,
} from "./edgar";
import {
  composeTtm,
  type FiscalPeriod,
  type FundamentalPeriod,
  type LatestFundamentalSet,
} from "./fundamentalPeriods";
import { unzipFiles } from "./zip";

const KEY = process.env.OPENDART_API_KEY;
const VIEWER = "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=";

/** 공시 해석 힌트 톤(색·뉘앙스). */
export type HintTone = "warn" | "good" | "info";

/** 공시가 "의미하는 바"를 질문으로 던지는 힌트(단정 아님 — 판단은 본인). */
export interface DisclosureHint {
  tone: HintTone;
  text: string;
}

/** 한 건의 공시. */
export interface Disclosure {
  date: string; // YYYY-MM-DD(접수일)
  title: string; // 보고서명
  rceptNo: string; // 접수번호
  url: string; // DART 원문 뷰어
  corpName: string; // 회사명(멀티 종목 집계 표시용)
  stockCode: string;
  /** 규칙 기반 해석 힌트(없으면 미표시). AI 요약은 별도(V3). */
  hint?: DisclosureHint;
}

/**
 * 공시 제목 → 해석 힌트(펀더멘털 플래그). 규칙 기반·토큰 0.
 * "단정 아니라 힌트" — 무슨 의미인지 + 확인할 것을 질문형으로. (PRD §11)
 * 구체·강한 신호를 먼저 검사(순서 중요).
 */
const HINT_RULES: { re: RegExp; tone: HintTone; text: string }[] = [
  { re: /상장폐지|관리종목|거래정지|상장적격성/, tone: "warn", text: "상장·거래 리스크 — 즉시 원문 확인하세요." },
  { re: /횡령|배임/, tone: "warn", text: "지배구조 리스크 — 규모·영향 확인." },
  { re: /감자/, tone: "warn", text: "감자 — 자본 구조가 바뀌어요. 목적 확인." },
  { re: /전환사채|신주인수권부사채|교환사채/, tone: "warn", text: "잠재적 희석 — 향후 주식 전환 가능, 규모 확인." },
  { re: /유상증자/, tone: "warn", text: "주식 수↑ 가능(지분 희석) — 자금 용도·규모 확인." },
  { re: /합병|분할|영업양수|영업양도|주식교환/, tone: "warn", text: "회사 구조 변경 — 비율·목적 확인." },
  { re: /소송|손해배상|가처분|소제기/, tone: "warn", text: "우발부채 가능 — 규모·승소 가능성 점검." },
  { re: /자기주식.*취득|자사주.*취득|자기주식취득/, tone: "good", text: "자사주 매입 — 주주환원 신호일 수 있어요." },
  { re: /소각/, tone: "good", text: "주식 소각 — 주식 수↓(주당가치↑) 신호." },
  { re: /자기주식.*처분|자사주.*처분|자기주식처분/, tone: "info", text: "자사주 처분 — 유통주식↑(희석 효과 가능), 목적 확인." },
  { re: /매출액또는손익구조|손익구조.{0,4}변경/, tone: "warn", text: "손익구조 30%+ 변동 — 어닝 서프라이즈/쇼크, 즉시 확인." },
  { re: /대표이사.*변경|대표이사변경/, tone: "info", text: "대표이사 변경 — 경영진 교체, 배경 확인." },
  { re: /기업설명회|IR개최|기업설명/, tone: "info", text: "IR·실적 설명회 — 회사 설명 확인." },
  { re: /장래사업.*경영계획|경영계획/, tone: "info", text: "사업·경영계획 발표 — 가이던스 확인." },
  { re: /주주총회소집|주총소집/, tone: "info", text: "주주총회 소집 — 안건 확인." },
  { re: /무상증자/, tone: "info", text: "무상증자 — 주식 수↑(주당가치 조정), 실질 변화는 작아요." },
  { re: /대량보유상황보고서|대량보유/, tone: "info", text: "5%+ 대량보유 변동 — 누가 지분을 늘렸나/줄였나 확인." },
  { re: /특정증권등소유상황|소유주식변동|최대주주.*변동|임원ㆍ주요주주/, tone: "info", text: "대주주·임원 지분 변동 — 매도면 약세 신호일 수 있어요. 방향 확인." },
  { re: /공급계약|단일판매|수주|공급/, tone: "info", text: "대형 계약 — 매출 영향 가능, 규모 확인." },
  { re: /현금ㆍ현물배당|배당/, tone: "info", text: "배당 관련 — 배당 탭에서 확인." },
  { re: /잠정실적|영업실적|매출액또는손익구조/, tone: "info", text: "실적 공시 — 펀더멘털을 확인하세요." },
  { re: /사업보고서|분기보고서|반기보고서/, tone: "info", text: "정기 실적 보고 — 재무제표가 업데이트돼요." },
];

export function disclosureHint(title: string): DisclosureHint | undefined {
  for (const r of HINT_RULES) {
    if (r.re.test(title)) return { tone: r.tone, text: r.text };
  }
  return undefined;
}

/** 노이즈 공시(피드에서 제외) — 임원·최대주주 소유 변동류. */
const NOISE = ["특정증권등소유상황보고서", "최대주주등소유주식변동신고서"];

function clean(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

function reportText(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/?(?:title|p|tr|td|br|section|table)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_, hex, decimal) =>
      String.fromCodePoint(Number.parseInt(hex ?? decimal, hex ? 16 : 10)),
    )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function longestBusinessSection(text: string): string | null {
  const starts = [...text.matchAll(/(?:^|\n)\s*II\.?\s*사업의\s*내용/gi)];
  let longest = "";
  for (const start of starts) {
    const from = (start.index ?? 0) + start[0].length;
    const rest = text.slice(from);
    const end = rest.search(/(?:^|\n)\s*III\.?\s*재무에\s*관한\s*사항/i);
    const section = (end >= 0 ? rest.slice(0, end) : rest).trim();
    if (section.length > longest.length) longest = section;
  }
  return longest.length >= 100 ? longest : null;
}

/** 최신 DART 사업보고서의 `II. 사업의 내용` 원문을 가져온다. */
export async function getBusinessSectionKR(stockCode: string): Promise<string | null> {
  if (!KEY || !/^\d{6}$/.test(stockCode)) return null;
  try {
    const corp = (await corpCodeMap()).get(stockCode);
    if (!corp) return null;
    const now = new Date();
    const from = `${now.getUTCFullYear() - 3}0101`;
    const to = `${now.getUTCFullYear()}1231`;
    const list = await fetch(
      `https://opendart.fss.or.kr/api/list.json?crtfc_key=${KEY}` +
        `&corp_code=${corp}&bgn_de=${from}&end_de=${to}&pblntf_detail_ty=A001` +
        `&page_count=10&sort=date&sort_mth=desc`,
      { next: { revalidate: 86400 } },
    );
    if (!list.ok) return null;
    const listJson = await list.json();
    const report = listJson?.list?.find((item: { report_nm?: unknown }) =>
      typeof item.report_nm === "string" && item.report_nm.includes("사업보고서"),
    );
    const receipt = String(report?.rcept_no ?? "");
    if (!receipt) return null;

    const document = await fetch(
      `https://opendart.fss.or.kr/api/document.xml?crtfc_key=${KEY}&rcept_no=${receipt}`,
      { next: { revalidate: 604800 } },
    );
    if (!document.ok) return null;
    const buffer = Buffer.from(await document.arrayBuffer());
    const files = unzipFiles(buffer);
    let longest: string | null = null;
    for (const file of files) {
      const section = longestBusinessSection(reportText(file.toString("utf8")));
      if (section && (!longest || section.length > longest.length)) longest = section;
    }
    return longest;
  } catch {
    return null;
  }
}

// ── stock_code → corp_code 매핑(메모이즈) ──
let _mapPromise: Promise<Map<string, string>> | null = null;

async function fetchCorpCodeMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!KEY) return map;
  const res = await fetch(
    `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${KEY}`,
    { next: { revalidate: 86400 } }, // 기업목록 일 1회 갱신
  );
  if (!res.ok) return map;
  const buf = Buffer.from(await res.arrayBuffer());
  // 단일 파일 zip: 로컬 헤더 파싱 후 raw deflate 해제(zlib 내장, 의존성 없음).
  if (buf.length < 30 || buf.readUInt32LE(0) !== 0x04034b50) return map;
  const nameLen = buf.readUInt16LE(26);
  const extraLen = buf.readUInt16LE(28);
  const dataStart = 30 + nameLen + extraLen;
  const xml = zlib.inflateRawSync(buf.subarray(dataStart)).toString("utf8");
  // <list> 블록 단위 파싱(corp_name 과 stock_code 사이에 corp_eng_name 이 끼어 있음).
  // stock_code(6자리)가 있는 상장사만(비상장은 공백 → 매칭 안 됨).
  const blockRe = /<list>([\s\S]*?)<\/list>/g;
  let b: RegExpExecArray | null;
  while ((b = blockRe.exec(xml)) !== null) {
    const cc = b[1].match(/<corp_code>(\d+)<\/corp_code>/);
    const sc = b[1].match(/<stock_code>\s*(\d{6})\s*<\/stock_code>/);
    if (cc && sc) map.set(sc[1], cc[1]);
  }
  return map;
}

function corpCodeMap(): Promise<Map<string, string>> {
  if (!_mapPromise) {
    _mapPromise = fetchCorpCodeMap().catch(() => {
      _mapPromise = null; // 실패 시 다음 호출에서 재시도
      return new Map<string, string>();
    });
  }
  return _mapPromise;
}

/**
 * 한국 종목 업종 코드(KSIC) — company.json 의 induty_code. 섹터 태그 매핑(sector.ts)용.
 * 한국 6자리만. 실패·키 없음·미상장이면 null.
 */
export async function getIndutyCodeKR(
  stockCode: string,
): Promise<string | null> {
  if (!KEY || !/^\d{6}$/.test(stockCode)) return null;
  try {
    const corp = (await corpCodeMap()).get(stockCode);
    if (!corp) return null;
    const res = await fetch(
      `https://opendart.fss.or.kr/api/company.json?crtfc_key=${KEY}&corp_code=${corp}`,
      { next: { revalidate: 604800 } }, // 업종은 거의 안 바뀜 → 주 1회
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.status !== "000") return null;
    const code = String(json.induty_code ?? "").trim();
    return code || null;
  } catch {
    return null;
  }
}

/**
 * 한 종목의 기간 내 공시(최신순, 노이즈 제외).
 * 한국 6자리 종목만(그 외·키 없음 → []). 실패는 조용히 [].
 */
export async function getDisclosures(
  stockCode: string,
  fromDate: string,
  toDate: string,
  limit = 5,
): Promise<Disclosure[]> {
  if (!KEY || !/^\d{6}$/.test(stockCode)) return [];
  try {
    const corp = (await corpCodeMap()).get(stockCode);
    if (!corp) return [];
    const bgn = fromDate.replace(/-/g, "");
    const end = toDate.replace(/-/g, "");
    const res = await fetch(
      `https://opendart.fss.or.kr/api/list.json?crtfc_key=${KEY}` +
        `&corp_code=${corp}&bgn_de=${bgn}&end_de=${end}&page_count=30&sort=date&sort_mth=desc`,
      { next: { revalidate: 21600 } }, // 공시 6시간 캐시
    );
    if (!res.ok) return [];
    const json = await res.json();
    if (json?.status !== "000" || !Array.isArray(json.list)) return [];
    const out: Disclosure[] = [];
    for (const it of json.list) {
      const title = clean(String(it.report_nm ?? ""));
      if (!title || NOISE.some((n) => title.includes(n))) continue;
      const dt = String(it.rcept_dt ?? "");
      const date =
        dt.length === 8 ? `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}` : dt;
      out.push({
        date,
        title,
        rceptNo: String(it.rcept_no ?? ""),
        url: VIEWER + String(it.rcept_no ?? ""),
        corpName: clean(String(it.corp_name ?? "")),
        stockCode,
        hint: disclosureHint(title),
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** 공시 유형 필터(DART pblntf_ty 대분류). 전체보기 페이지 칩용. */
export const DISCLOSURE_TYPES: { key: string; label: string; ty: string }[] = [
  { key: "all", label: "전체", ty: "" },
  { key: "A", label: "정기", ty: "A" }, // 사업·반기·분기보고서
  { key: "B", label: "주요사항", ty: "B" }, // 증자·합병·소송·자사주 등
  { key: "C", label: "발행", ty: "C" }, // 증권 발행(증자·사채)
  { key: "D", label: "지분·대주주", ty: "D" }, // 대주주·임원 지분, 5% 대량보유
  { key: "I", label: "거래소", ty: "I" }, // 수시공시·풍문·실적
  { key: "E", label: "기타", ty: "E" }, // 자기주식 결과보고 등
];

export interface DisclosurePage {
  items: Disclosure[];
  page: number;
  totalPages: number;
  total: number;
}

/**
 * 한 종목 공시 페이지(유형 필터 + 페이지네이션). 전체보기 페이지용.
 * 노이즈 필터 없음(전체 = 있는 그대로). 각 항목에 해석 힌트 부착.
 */
export async function getDisclosurePage(
  stockCode: string,
  opts: {
    type?: string; // pblntf_ty(빈 문자열=전체)
    page?: number;
    pageCount?: number;
    fromDate: string;
    toDate: string;
  },
): Promise<DisclosurePage> {
  const empty: DisclosurePage = { items: [], page: 1, totalPages: 0, total: 0 };
  if (!KEY || !/^\d{6}$/.test(stockCode)) return empty;
  try {
    const corp = (await corpCodeMap()).get(stockCode);
    if (!corp) return empty;
    const page = Math.max(1, opts.page ?? 1);
    const pageCount = opts.pageCount ?? 20;
    const bgn = opts.fromDate.replace(/-/g, "");
    const end = opts.toDate.replace(/-/g, "");
    const tyParam = opts.type ? `&pblntf_ty=${opts.type}` : "";
    const res = await fetch(
      `https://opendart.fss.or.kr/api/list.json?crtfc_key=${KEY}` +
        `&corp_code=${corp}&bgn_de=${bgn}&end_de=${end}${tyParam}` +
        `&page_no=${page}&page_count=${pageCount}&sort=date&sort_mth=desc`,
      { next: { revalidate: 21600 } },
    );
    if (!res.ok) return empty;
    const json = await res.json();
    if (json?.status !== "000" || !Array.isArray(json.list))
      return { ...empty, page };
    const items: Disclosure[] = json.list.map((it: Record<string, unknown>) => {
      const title = clean(String(it.report_nm ?? ""));
      const dt = String(it.rcept_dt ?? "");
      const date =
        dt.length === 8 ? `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}` : dt;
      return {
        date,
        title,
        rceptNo: String(it.rcept_no ?? ""),
        url: VIEWER + String(it.rcept_no ?? ""),
        corpName: clean(String(it.corp_name ?? "")),
        stockCode,
        hint: disclosureHint(title),
      };
    });
    return {
      items,
      page: Number(json.page_no) || page,
      totalPages: Number(json.total_page) || 0,
      total: Number(json.total_count) || 0,
    };
  } catch {
    return empty;
  }
}

// ─────────────────────────────────────────────────────────────
// 재무제표(주요계정) → 펀더멘털. fnlttSinglAcnt + 발행주식수(stockTotqySttus).
// ─────────────────────────────────────────────────────────────

export interface Fundamentals {
  year: number; // 사업연도
  fsDiv: "연결" | "개별";
  revenue: number | null; // 매출액(₩)
  operatingIncome: number | null; // 영업이익(₩)
  netIncome: number | null; // 당기순이익(지배주주 우선)
  assets: number | null; // 자산총계
  liabilities: number | null; // 부채총계
  equity: number | null; // 자본총계
  intangibles: number | null; // 무형자산(+영업권) — 순유형자산 산출용(RONTE)
  receivables: number | null; // 매출채권(유동) — 이익의 질 플래그(밀어내기)용
  inventory: number | null; // 재고자산 — 이익의 질 플래그(떨이 임박)용
  retainedEarnings: number | null; // 이익잉여금 — 유보 증가(RNI·RMC)용
  ocf: number | null; // 영업활동현금흐름
  icf: number | null; // 투자활동현금흐름
  ffcf: number | null; // 재무활동현금흐름
  interestExpense: number | null; // 이자비용(이자의 지급, CF·절대값) — 이자보상배율용
  capex: number | null; // 총CapEx = 유형+무형자산 취득(절대값)
  dna: number | null; // 감가상각비(D&A) — 한국 공시는 대개 미제공(null)
  fcf: number | null; // 잉여현금흐름 = 영업현금 − 총CapEx (추정 없음, §-71)
  ownerEarnings: number | null; // 오너이익 = 순이익 + D&A − 총CapEx (D&A 있을 때만; §12-1)
  roe: number | null; // 지배주주순이익/지배주주자본
  debtRatio: number | null; // 부채총계/자본총계
  operatingMargin: number | null; // 영업이익/매출액
  shares: number | null; // 보통주 유통주식수
  eps: number | null; // 순이익/주식수(참고)
  /** 은행·보험 등 금융업(매출 개념 없음) → 일반 지표 해석 주의. */
  isFinancial: boolean;
  /** 데이터 신뢰도: 항등식·핵심항목 충족 여부. */
  confidence: "high" | "low";
}

function parseAmt(s: unknown): number | null {
  const n = Number(String(s ?? "").replace(/,/g, ""));
  return Number.isFinite(n) && n !== 0 ? n : null;
}

function parseCount(s: unknown): number | null {
  const n = Number(String(s ?? "").replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const REPORT_CODES: Record<FiscalPeriod, string> = {
  FY: "11011",
  H1: "11012",
  Q1: "11013",
  Q3: "11014",
};

async function fetchShares(
  corp: string,
  year: number,
  fiscalPeriod: FiscalPeriod = "FY",
): Promise<number | null> {
  try {
    const res = await fetch(
      `https://opendart.fss.or.kr/api/stockTotqySttus.json?crtfc_key=${KEY}` +
        `&corp_code=${corp}&bsns_year=${year}&reprt_code=${REPORT_CODES[fiscalPeriod]}`,
      { next: { revalidate: 86400 } },
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.status !== "000" || !Array.isArray(json.list)) return null;
    const common = json.list.find((r: Record<string, unknown>) =>
      String(r.se ?? "").includes("보통주"),
    );
    // 유통주식수(자기주식 제외) = EPS·시총 기준. DART는 회사·보고서에 따라
    // distb_stock_co를 비우므로 발행주식수(istc_totqy) - 자기주식수로 보충한다.
    const distributed = parseAmt(common?.distb_stock_co);
    if (distributed != null) return distributed;
    const issued =
      parseAmt(common?.istc_totqy) ?? parseAmt(common?.isu_stock_totqy);
    const treasury = parseCount(common?.tesstk_co) ?? 0;
    return issued != null && issued > treasury ? issued - treasury : issued;
  } catch {
    return null;
  }
}

/** 전체계정 1개 연도·fs_div 조회. status 000 아니면 null. */
async function fetchAllAccounts(
  corp: string,
  year: number,
  fsDiv: "CFS" | "OFS",
  fiscalPeriod: FiscalPeriod = "FY",
): Promise<Record<string, unknown>[] | null> {
  const res = await fetch(
    `https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json?crtfc_key=${KEY}` +
      `&corp_code=${corp}&bsns_year=${year}&reprt_code=${REPORT_CODES[fiscalPeriod]}&fs_div=${fsDiv}`,
    { next: { revalidate: 86400 } },
  );
  if (!res.ok) return null;
  const json = await res.json();
  return json?.status === "000" && Array.isArray(json.list) && json.list.length
    ? json.list
    : null;
}

function periodEnd(rows: Record<string, unknown>[], year: number, period: FiscalPeriod): string {
  const raw = String(rows[0]?.thstrm_dt ?? "").replace(/\./g, "-");
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const suffix = period === "Q1" ? "03-31" : period === "H1" ? "06-30" : period === "Q3" ? "09-30" : "12-31";
  return `${year}-${suffix}`;
}

async function fetchDartPeriod(
  corp: string,
  year: number,
  fiscalPeriod: Exclude<FiscalPeriod, "FY">,
  fsDiv: "CFS" | "OFS",
): Promise<FundamentalPeriod | null> {
  const rows = await fetchAllAccounts(corp, year, fsDiv, fiscalPeriod);
  if (!rows) return null;
  const shares = await fetchShares(corp, year, fiscalPeriod);
  return {
    fiscalYear: year,
    fiscalPeriod,
    periodEnd: periodEnd(rows, year, fiscalPeriod),
    data: extractFundamentals(rows, year, fsDiv, shares),
  };
}

/** 고객 화면용 최신 TTM + 직전 FY. TTM 구성 실패 시 FY와 사유를 함께 반환한다. */
export async function getLatestFundamentalSet(
  stockCode: string,
  currentYear: number,
  supabase?: SupabaseClient<Database>,
): Promise<LatestFundamentalSet> {
  const latestAnnual = await getFundamentals(stockCode, currentYear, supabase);
  if (!latestAnnual)
    return { ttm: null, latestAnnual: null, fallbackReason: "재무 공시를 찾지 못했습니다." };
  if (!/^\d{6}$/.test(stockCode)) {
    const ttm = await getTtmFundamentalsUS(stockCode, currentYear);
    return {
      ttm,
      latestAnnual,
      fallbackReason: ttm ? null : "SEC 분기 비교 공시가 부족해 직전 연간을 표시합니다.",
    };
  }
  if (!KEY)
    return { ttm: null, latestAnnual, fallbackReason: "DART 연결이 없어 직전 FY를 표시합니다." };

  try {
    const corp = (await corpCodeMap()).get(stockCode);
    if (!corp)
      return { ttm: null, latestAnnual, fallbackReason: "기업 식별정보가 없어 직전 FY를 표시합니다." };
    const fsDiv = latestAnnual.fsDiv === "연결" ? "CFS" : "OFS";
    const annualShares =
      latestAnnual.shares ?? (await fetchShares(corp, latestAnnual.year, "FY"));
    const annualData =
      annualShares != null && latestAnnual.shares == null
        ? { ...latestAnnual, shares: annualShares }
        : latestAnnual;
    const annual: FundamentalPeriod = {
      fiscalYear: latestAnnual.year,
      fiscalPeriod: "FY",
      periodEnd: `${latestAnnual.year}-12-31`,
      data: annualData,
    };
    const ytdYear = latestAnnual.year + 1;
    for (const fiscalPeriod of ["Q3", "H1", "Q1"] as const) {
      // current·prior 는 composeTtm 에 둘 다 필요 → 병렬 조회(직렬 2왕복 → 1라운드).
      const [current, prior] = await Promise.all([
        fetchDartPeriod(corp, ytdYear, fiscalPeriod, fsDiv),
        fetchDartPeriod(corp, ytdYear - 1, fiscalPeriod, fsDiv),
      ]);
      if (!current) continue;
      const ttm = composeTtm(annual, current, prior);
      if (ttm) return { ttm, latestAnnual, fallbackReason: null };
    }
    return { ttm: null, latestAnnual, fallbackReason: "동일 분기의 전년 비교 공시가 부족해 직전 FY를 표시합니다." };
  } catch {
    return { ttm: null, latestAnnual, fallbackReason: "TTM 계산 중 공시 조회가 실패해 직전 FY를 표시합니다." };
  }
}

/**
 * 한 종목의 최신 연간 펀더멘털. 한국 6자리만.
 * **account_id(IFRS/DART 표준코드) 결정적 추출** — 한글 이름 매칭보다 신뢰도↑.
 * 전체계정(fnlttSinglAcntAll)이라 현금흐름표 포함 → 오너이익(FCF) 계산.
 * 연결(CFS) 우선·개별(OFS) 폴백, 최신 사업연도 역순 탐색. 키 없거나 해외면 null.
 */
export async function getFundamentals(
  stockCode: string,
  currentYear: number,
  supabase?: SupabaseClient<Database>,
): Promise<Fundamentals | null> {
  // 비-6자리(해외) → SEC EDGAR(₩ 환산해 동일 형태 반환).
  if (!/^\d{6}$/.test(stockCode)) return getFundamentalsUS(stockCode, currentYear);
  if (!KEY) return null;

  const years = [currentYear - 1, currentYear - 2, currentYear - 3];

  // 1. DB 캐시 먼저 확인
  if (supabase) {
    try {
      const { data: cachedRows } = await supabase
        .from("fundamentals_cache")
        .select("*")
        .eq("symbol", stockCode)
        .in("year", years);

      if (cachedRows && cachedRows.length > 0) {
        // 연도 내림차순(최신순), 연결('연결') 우선 정렬
        const sorted = cachedRows.sort((a, b) => {
          if (a.year !== b.year) return b.year - a.year;
          return a.fs_div === "연결" ? -1 : 1;
        });
        if (sorted[0]) {
          return sorted[0].data as unknown as Fundamentals;
        }
      }
    } catch {
      // 캐시 에러 시 계속 진행
    }
  }

  try {
    const corp = (await corpCodeMap()).get(stockCode);
    if (!corp) return null;

    // 2. 캐시 미스 시 병렬 API 호출
    const fetchPromises = years.flatMap((y) =>
      (["CFS", "OFS"] as const).map((fs) =>
        fetchAllAccounts(corp, y, fs).then((got) => ({
          rows: got,
          year: y,
          fsDiv: fs,
        })),
      ),
    );

    const fetchedResults = await Promise.all(fetchPromises);
    const validResults = fetchedResults
      .filter((r): r is { rows: Record<string, unknown>[]; year: number; fsDiv: "CFS" | "OFS" } => r.rows != null)
      .sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return a.fsDiv === "CFS" ? -1 : 1;
      });

    const bestResult = validResults[0];
    if (!bestResult) return null;

    const shares = await fetchShares(corp, bestResult.year);
    const fund = extractFundamentals(bestResult.rows, bestResult.year, bestResult.fsDiv, shares);

    // 3. 페치 성공 시 DB 캐시에 비동기 저장
    if (fund && supabase) {
      try {
        await supabase
          .from("fundamentals_cache")
          .upsert({
            symbol: stockCode,
            year: bestResult.year,
            fs_div: bestResult.fsDiv === "CFS" ? "연결" : "개별",
            data: fund as unknown as Json,
          }, { onConflict: "symbol,year,fs_div" });
      } catch {
        // 캐시 쓰기 실패 시 무시
      }
    }

    return fund;
  } catch {
    return null;
  }
}

/**
 * 여러 연도 펀더멘털(최신순) — 다년 평균·추세용. currentYear-1 부터 maxYears 만큼 역순.
 * 연도별로 CFS 우선·OFS 폴백 + 연도별 발행주식수(과거 EPS·PER용). 데이터 있는 연도만.
 */
export async function getFundamentalsSeries(
  stockCode: string,
  currentYear: number,
  maxYears = 10,
  supabase?: SupabaseClient<Database>,
): Promise<Fundamentals[]> {
  if (!/^\d{6}$/.test(stockCode))
    return getFundamentalsSeriesUS(stockCode, currentYear, maxYears);
  if (!KEY) return [];

  const years: number[] = [];
  for (let i = 1; i <= maxYears; i++) years.push(currentYear - i);

  // 1. DB 캐시 확인
  const cachedMap = new Map<number, Fundamentals>();
  if (supabase) {
    try {
      const { data: cachedRows } = await supabase
        .from("fundamentals_cache")
        .select("*")
        .eq("symbol", stockCode)
        .in("year", years);

      if (cachedRows) {
        const sorted = cachedRows.sort((a, b) => {
          if (a.year !== b.year) return 0;
          return a.fs_div === "연결" ? -1 : 1;
        });
        for (const row of sorted) {
          cachedMap.set(row.year, row.data as unknown as Fundamentals);
        }
      }
    } catch {
      // 캐시 에러 무시
    }
  }

  const missingYears = years.filter((y) => !cachedMap.has(y));

  // 2. 모든 연도가 이미 캐시되어 있으면 바로 반환
  if (missingYears.length === 0) {
    return years
      .map((y) => cachedMap.get(y)!)
      .filter((f): f is Fundamentals => f != null);
  }

  try {
    const corp = (await corpCodeMap()).get(stockCode);
    if (!corp) return [];

    // fsDiv 일관성 결정을 위해 캐시/API 혼합 검증
    let fsDiv: "CFS" | "OFS" | null = null;
    for (const y of years) {
      const cached = cachedMap.get(y);
      if (cached) {
        if (cached.fsDiv === "연결") {
          fsDiv = "CFS";
          break;
        }
      } else {
        if (await fetchAllAccounts(corp, y, "CFS")) {
          fsDiv = "CFS";
          break;
        }
      }
    }
    if (!fsDiv) {
      for (const y of years) {
        const cached = cachedMap.get(y);
        if (cached) {
          if (cached.fsDiv === "개별") {
            fsDiv = "OFS";
            break;
          }
        } else {
          if (await fetchAllAccounts(corp, y, "OFS")) {
            fsDiv = "OFS";
            break;
          }
        }
      }
    }
    if (!fsDiv) return [];

    // 결측 연도 페칭
    const fetched = await Promise.all(
      missingYears.map(async (y) => {
        // 전체계정·발행주식수는 서로 독립 → 병렬(연도당 직렬 2왕복 → 1라운드).
        const [got, shares] = await Promise.all([
          fetchAllAccounts(corp, y, fsDiv!),
          fetchShares(corp, y),
        ]);
        if (!got) return null;
        const fund = extractFundamentals(got, y, fsDiv!, shares);

        if (fund && supabase) {
          try {
            await supabase
              .from("fundamentals_cache")
              .upsert({
                symbol: stockCode,
                year: y,
                fs_div: fsDiv === "CFS" ? "연결" : "개별",
                data: fund as unknown as Json,
              }, { onConflict: "symbol,year,fs_div" });
          } catch {
            // 캐시 쓰기 실패 시 무시
          }
        }
        return fund;
      }),
    );

    const out: Fundamentals[] = [];
    for (const y of years) {
      if (cachedMap.has(y)) {
        out.push(cachedMap.get(y)!);
      } else {
        const idx = missingYears.indexOf(y);
        const f = fetched[idx];
        if (f) out.push(f);
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** rows(전체계정 1개 연도) → Fundamentals. account_id 결정적 추출. */
function extractFundamentals(
  rows: Record<string, unknown>[],
  year: number,
  fsDiv: "CFS" | "OFS",
  shares: number | null,
): Fundamentals {
  // account_id 우선, 없으면 account_nm 폴백. 후보를 순서대로 시도.
  // DART 가 옛 공시(~2017)는 `ifrs_` 접두어, 최근은 `ifrs-full_` 를 쓴다 → 둘 다 시도(다년 추세 보존).
  const byId = (...ids: string[]): number | null => {
    const expanded = ids.flatMap((id) =>
      id.startsWith("ifrs-full_")
        ? [id, `ifrs_${id.slice("ifrs-full_".length)}`]
        : [id],
    );
    for (const id of expanded) {
      const hit = rows.find((r) => r.account_id === id);
      if (hit) {
        const v = parseAmt(hit.thstrm_amount);
        if (v != null) return v;
      }
    }
    return null;
  };
  const byNm = (test: (nm: string) => boolean): number | null => {
    const hit = rows.find((r) => test(String(r.account_nm ?? "")));
    return hit ? parseAmt(hit.thstrm_amount) : null;
  };
  // 재무상태표(BS) 한정 이름 매칭 — "매출채권의 증가"(CF) 등 동명 계정 오선택 방지.
  const byNmBS = (test: (nm: string) => boolean): number | null => {
    const hit = rows.find(
      (r) => r.sj_div === "BS" && test(String(r.account_nm ?? "")),
    );
    return hit ? parseAmt(hit.thstrm_amount) : null;
  };

  const revenue =
      byId("ifrs-full_Revenue", "ifrs-full_RevenueFromContractsWithCustomers") ??
      byNm((n) => n === "매출액");
    const operatingIncome =
      byId("dart_OperatingIncomeLoss", "ifrs-full_OperatingIncomeLoss") ??
      byNm((n) => n === "영업이익");
    // 순이익·자본은 지배주주 귀속 우선(ROE·EPS 정확도).
    const netIncome =
      byId("ifrs-full_ProfitLossAttributableToOwnersOfParent", "ifrs-full_ProfitLoss") ??
      byNm((n) => n.includes("당기순이익"));
    const assets = byId("ifrs-full_Assets") ?? byNm((n) => n === "자산총계");
    const liabilities = byId("ifrs-full_Liabilities") ?? byNm((n) => n === "부채총계");
    const equityTotal = byId("ifrs-full_Equity") ?? byNm((n) => n === "자본총계");
    const equityParent =
      byId("ifrs-full_EquityAttributableToOwnersOfParent") ?? equityTotal;
    // 무형자산(+영업권): 합산계정 우선, 없으면 무형+영업권 개별 합(연도별 표기 상이).
    const intanGw = byId("ifrs-full_IntangibleAssetsAndGoodwill");
    const intanOther = byId("ifrs-full_IntangibleAssetsOtherThanGoodwill");
    const goodwill = byId("ifrs-full_Goodwill");
    const intangibles =
      intanGw ??
      (intanOther != null || goodwill != null
        ? (intanOther ?? 0) + (goodwill ?? 0)
        : null);
    // 매출채권(유동) — 밀어내기 매출 플래그. 합산계정 우선, 없으면 BS 한정 이름.
    const receivables =
      byId(
        "ifrs-full_TradeAndOtherCurrentReceivables",
        "ifrs-full_CurrentTradeReceivables",
      ) ?? byNmBS((n) => n.includes("매출채권") && !n.includes("비유동"));
    // 재고자산 — 떨이 임박 플래그.
    const inventory =
      byId("ifrs-full_Inventories") ?? byNmBS((n) => n === "재고자산");
    const retainedEarnings =
      byId("ifrs-full_RetainedEarnings") ?? byNm((n) => n.includes("이익잉여금"));
    const ocf = byId("ifrs-full_CashFlowsFromUsedInOperatingActivities");
    const icf = byId("ifrs-full_CashFlowsFromUsedInInvestingActivities");
    const ffcf = byId("ifrs-full_CashFlowsFromUsedInFinancingActivities");
    // 이자비용 = 실제 지급 이자(CF). 손익의 금융비용은 환차손 등 섞여 부적합.
    const interestPaid = byId(
      "ifrs-full_InterestPaidClassifiedAsOperatingActivities",
      "ifrs-full_InterestPaidClassifiedAsFinancingActivities",
    );
    const interestExpense = interestPaid != null ? Math.abs(interestPaid) : null;
    // 총CapEx = 유형 + 무형자산 취득(절대값).
    const capexPpe = byId(
      "ifrs-full_PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities",
    );
    const capexIntan = byId(
      "ifrs-full_PurchaseOfIntangibleAssetsClassifiedAsInvestingActivities",
    );
    const capex =
      capexPpe != null || capexIntan != null
        ? Math.abs(capexPpe ?? 0) + Math.abs(capexIntan ?? 0)
        : null;
    // 감가상각비(D&A) = 유형 감가상각 + 무형자산상각 + 사용권자산상각 합산.
    // 한국 대기업은 현금흐름표 본문에 안 쪼개고 '조정' 한 줄로 합산(주석에만) → 보통 null.
    // 쪼개 표시하는 회사면 CF 본문에서 합산. (금융자산 상각·매출원가 상각은 제외)
    const depRows = rows.filter(
      (r) =>
        r.sj_div === "CF" &&
        /감가상각|무형자산상각|무형자산의\s*상각|사용권자산/.test(
          String(r.account_nm ?? ""),
        ) &&
        !/금융자산|상각후원가/.test(String(r.account_nm ?? "")),
    );
    let dna: number | null =
      byId(
        "dart_DepreciationExpense",
        "ifrs-full_DepreciationAndAmortisationExpense",
        "ifrs-full_DepreciationExpense",
      ) ?? null;
    if (dna == null && depRows.length) {
      const s = depRows.reduce((a, r) => a + (parseAmt(r.thstrm_amount) ?? 0), 0);
      dna = s > 0 ? s : null;
    }

    // 금융업: 매출(ifrs-full_Revenue) 없음 → 일반 지표 해석 주의.
    const isFinancial = revenue == null;
    // FCF(추정 없음) = 영업현금 − 총CapEx. 오너이익(§12-1) = 순이익 + D&A − 총CapEx(D&A 있을 때만).
    const fcf = ocf != null && capex != null ? ocf - capex : null;
    const ownerEarnings =
      netIncome != null && dna != null && capex != null
        ? netIncome + dna - capex
        : null;
    const roe =
      netIncome != null && equityParent && equityParent > 0
        ? netIncome / equityParent
        : null;
    const debtRatio =
      liabilities != null && equityTotal && equityTotal > 0
        ? liabilities / equityTotal
        : null;
    const operatingMargin =
      operatingIncome != null && revenue && revenue > 0
        ? operatingIncome / revenue
        : null;
    const eps =
      netIncome != null && shares && shares > 0 ? netIncome / shares : null;

    // 검증: 자산 ≈ 부채 + 자본(±1%) + 핵심 항목 존재 → high.
    let confidence: "high" | "low" = "high";
    if (assets == null || equityTotal == null || netIncome == null)
      confidence = "low";
    else if (liabilities != null) {
      const diff = Math.abs(assets - (liabilities + equityTotal));
      if (diff > Math.abs(assets) * 0.01) confidence = "low"; // 항등식 불일치
    }

    return {
      year,
      fsDiv: fsDiv === "CFS" ? "연결" : "개별",
      revenue,
      operatingIncome,
      netIncome,
      assets,
      liabilities,
      equity: equityTotal,
      intangibles,
      receivables,
      inventory,
      retainedEarnings,
      ocf,
      icf,
      ffcf,
      interestExpense,
      capex,
      dna,
      fcf,
      ownerEarnings,
      roe,
      debtRatio,
      operatingMargin,
      shares,
      eps,
      isFinancial,
      confidence,
    };
}

/**
 * 여러 종목의 기간 내 공시 집계(최신순). CFO 리포트 "이번 분기 주요 공시"용.
 */
export async function getDisclosuresForSymbols(
  stockCodes: string[],
  fromDate: string,
  toDate: string,
  perSymbol = 3,
  total = 8,
): Promise<Disclosure[]> {
  const korean = [...new Set(stockCodes)].filter((s) => /^\d{6}$/.test(s));
  if (korean.length === 0) return [];
  const results = await Promise.allSettled(
    korean.map((s) => getDisclosures(s, fromDate, toDate, perSymbol)),
  );
  const all: Disclosure[] = [];
  for (const r of results) if (r.status === "fulfilled") all.push(...r.value);
  all.sort((a, b) => (a.date < b.date ? 1 : -1)); // 최신순
  return all.slice(0, total);
}
