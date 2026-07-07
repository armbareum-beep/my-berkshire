/**
 * SEC EDGAR 연동 — 미국 종목 펀더멘털. DART(한국)와 동일한 `Fundamentals` 형태로 반환한다.
 *
 * 핵심: **USD 공시값을 현재 USD/KRW로 ₩ 환산해 반환** → 파이프라인이 ₩ 단일이라
 * lookThrough 합산·§12·시계열이 무수정으로 미국까지 확장(앱 기능통화=KRW).
 * `shares`(주식수)만 환산 없이 count 그대로.
 *
 * 데이터: company_tickers.json(티커→CIK) + companyfacts(전 연도 한 번에).
 * 연차 datapoint 선택 = form 10-K · fp FY · 기간≈1년(흐름) / end 일치(잔액). frame 미의존(최신연도 누락).
 * SEC는 User-Agent 헤더 필수.
 */

import { getUsdKrw } from "./fx";
import type { Disclosure, Fundamentals } from "./dart";
import {
  composeTtm,
  type FiscalPeriod,
  type FundamentalPeriod,
  type TtmFundamentals,
} from "./fundamentalPeriods";

const UA = "ENUF/1.0 (grapplay.com@gmail.com)";

export interface EdgarFact {
  start?: string;
  end: string;
  val: number;
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
  accn?: string;
  frame?: string;
}
type Fact = EdgarFact;
type ConceptMap = Record<string, { units?: Record<string, Fact[]> }>;
interface CompanyFacts {
  facts?: { "us-gaap"?: ConceptMap; dei?: ConceptMap };
}

// ── 티커 → CIK(10자리) 매핑(메모이즈) ──
let _cikMap: Promise<Map<string, string>> | null = null;

async function fetchCikMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
    headers: { "User-Agent": UA },
    next: { revalidate: 86400 },
  });
  if (!res.ok) return map;
  const json = (await res.json()) as Record<
    string,
    { cik_str: number; ticker: string }
  >;
  for (const row of Object.values(json)) {
    if (row?.ticker && row.cik_str != null)
      map.set(row.ticker.toUpperCase(), String(row.cik_str).padStart(10, "0"));
  }
  return map;
}

function cikMap(): Promise<Map<string, string>> {
  if (!_cikMap) {
    _cikMap = fetchCikMap().catch(() => {
      _cikMap = null; // 실패 시 다음 호출에서 재시도
      return new Map<string, string>();
    });
  }
  return _cikMap;
}

/**
 * CIK 조회용 티커 정규화 — SEC company_tickers.json은 대시 표기(BRK-B).
 * 과거 데이터에 슬래시 표기(BRK/B)가 남아 있어도 조회가 미스나지 않게 여기서 흡수한다
 * (미스나면 그 종목이 no_disclosure로 조용히 빠져 투시 순이익이 과소·과대 왜곡됨).
 */
async function cikOf(symbol: string): Promise<string | undefined> {
  return (await cikMap()).get(symbol.toUpperCase().replace(/\//g, "-"));
}

interface SubmissionRecent {
  accessionNumber?: string[];
  filingDate?: string[];
  reportDate?: string[];
  form?: string[];
  primaryDocument?: string[];
  primaryDocDescription?: string[];
}

/** 미국 종목 SEC 제출 목록. 통합 공시 피드에서 DART Disclosure와 같은 형태로 사용. */
export async function getDisclosuresUS(
  symbol: string,
  fromDate: string,
  toDate: string,
  limit = 20,
): Promise<Disclosure[]> {
  if (/^\d{6}$/.test(symbol)) return [];
  try {
    const cik = await cikOf(symbol);
    if (!cik) return [];
    const res = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
      headers: { "User-Agent": UA },
      next: { revalidate: 21600 },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      name?: string;
      filings?: { recent?: SubmissionRecent };
    };
    const recent = json.filings?.recent;
    if (!recent) return [];
    const out: Disclosure[] = [];
    const dates = recent.filingDate ?? [];
    for (let index = 0; index < dates.length; index += 1) {
      const date = dates[index];
      if (!date || date < fromDate || date > toDate) continue;
      const form = recent.form?.[index] ?? "SEC";
      const accession = recent.accessionNumber?.[index] ?? "";
      const document = recent.primaryDocument?.[index] ?? "";
      if (!accession || !document) continue;
      const description = recent.primaryDocDescription?.[index]?.trim();
      const accessionPath = accession.replace(/-/g, "");
      const cikPath = String(Number(cik));
      const hint =
        form === "8-K" || form === "8-K/A"
          ? { tone: "info" as const, text: "중요 사건 보고 — 발생 배경과 재무 영향을 확인하세요." }
          : /^(10-K|10-Q)(\/A)?$/.test(form)
            ? { tone: "info" as const, text: "정기 실적 보고 — 재무제표와 위험요인을 확인하세요." }
            : undefined;
      out.push({
        date,
        title: description ? `${form} · ${description}` : form,
        rceptNo: `sec:${accession}`,
        url: `https://www.sec.gov/Archives/edgar/data/${cikPath}/${accessionPath}/${document}`,
        corpName: json.name?.trim() || symbol.toUpperCase(),
        stockCode: symbol.toUpperCase(),
        hint,
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * 미국 종목 업종(SIC) 설명 — submissions JSON 의 sicDescription(자유 문자열).
 * 섹터 태그 매핑(sector.ts)용. 실패·미매핑이면 null. 키 불필요(UA만).
 */
export async function getSicDescriptionUS(
  symbol: string,
): Promise<string | null> {
  try {
    const cik = await cikOf(symbol);
    if (!cik) return null;
    const res = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
      headers: { "User-Agent": UA },
      next: { revalidate: 604800 }, // 업종은 거의 안 바뀜 → 주 1회
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { sicDescription?: string };
    const s = json.sicDescription?.trim();
    return s ? s : null;
  } catch {
    return null;
  }
}

function filingText(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/?(?:p|div|tr|td|br|section|table|h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function longestItemOne(text: string): string | null {
  const starts = [...text.matchAll(/(?:^|\n)\s*item\s+1[.\s:–-]+business/gi)];
  let longest = "";
  for (const start of starts) {
    const from = (start.index ?? 0) + start[0].length;
    const rest = text.slice(from);
    const end = rest.search(/(?:^|\n)\s*item\s+1a[.\s:–-]+risk factors/i);
    const section = (end >= 0 ? rest.slice(0, end) : rest).trim();
    if (section.length > longest.length) longest = section;
  }
  return longest.length >= 100 ? longest : null;
}

/** 최신 SEC 10-K의 Item 1. Business 원문을 가져온다. */
export async function getBusinessSectionUS(symbol: string): Promise<string | null> {
  if (/^\d{6}$/.test(symbol)) return null;
  try {
    const cik = await cikOf(symbol);
    if (!cik) return null;
    const submissions = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
      headers: { "User-Agent": UA },
      next: { revalidate: 86400 },
    });
    if (!submissions.ok) return null;
    const json = (await submissions.json()) as { filings?: { recent?: SubmissionRecent } };
    const recent = json.filings?.recent;
    const index = recent?.form?.findIndex((form) => form === "10-K") ?? -1;
    if (!recent || index < 0) return null;
    const accession = recent.accessionNumber?.[index];
    const document = recent.primaryDocument?.[index];
    if (!accession || !document) return null;
    const url = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, "")}/${document}`;
    const filing = await fetch(url, {
      headers: { "User-Agent": UA },
      next: { revalidate: 604800 },
    });
    if (!filing.ok) return null;
    return longestItemOne(filingText(await filing.text()));
  } catch {
    return null;
  }
}

async function fetchFacts(cik10: string): Promise<CompanyFacts | null> {
  try {
    const res = await fetch(
      `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10}.json`,
      { headers: { "User-Agent": UA }, next: { revalidate: 86400 } },
    );
    if (!res.ok) return null;
    return (await res.json()) as CompanyFacts;
  } catch {
    return null;
  }
}

// ── 추출 헬퍼 ──
function usd(cf: CompanyFacts, concept: string): Fact[] {
  return cf.facts?.["us-gaap"]?.[concept]?.units?.USD ?? [];
}
function sharesUnit(
  cf: CompanyFacts,
  ns: "us-gaap" | "dei",
  concept: string,
): Fact[] {
  return cf.facts?.[ns]?.[concept]?.units?.shares ?? [];
}
function days(a?: string, b?: string): number {
  if (!a || !b) return 0;
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}
const isAnnualForm = (f: Fact) =>
  (f.form === "10-K" || f.form === "10-K/A") && f.fp === "FY";
const isYearLong = (f: Fact) => {
  const d = days(f.start, f.end);
  return d >= 350 && d <= 380;
};

function fiscalPeriodOf(fact: Fact): Exclude<FiscalPeriod, "FY"> | null {
  if (fact.fp === "Q1") return "Q1";
  if (fact.fp === "Q2") return "H1";
  if (fact.fp === "Q3") return "Q3";
  return null;
}

function isYtdFact(fact: Fact): boolean {
  const period = fiscalPeriodOf(fact);
  const length = days(fact.start, fact.end);
  if (!period || (fact.form !== "10-Q" && fact.form !== "10-Q/A")) return false;
  if (period === "Q1") return length >= 70 && length <= 120;
  if (period === "H1") return length >= 150 && length <= 220;
  return length >= 240 && length <= 310;
}

function incomeFacts(cf: CompanyFacts): Fact[] {
  for (const concept of ["NetIncomeLoss", "ProfitLoss"]) {
    const facts = usd(cf, concept);
    if (facts.length) return facts;
  }
  return [];
}

export function selectLatestYtdPair(
  facts: EdgarFact[],
  annualEnd: string,
  asOfDate: string,
): { current: Fact; prior: Fact; fiscalPeriod: Exclude<FiscalPeriod, "FY"> } | null {
  const current = facts
    .filter(
      (fact) =>
        isYtdFact(fact) &&
        fact.end > annualEnd &&
        (!fact.filed || fact.filed <= asOfDate),
    )
    .sort((a, b) => a.end.localeCompare(b.end) || (a.filed ?? "").localeCompare(b.filed ?? ""))
    .at(-1);
  if (!current?.start) return null;
  const fiscalPeriod = fiscalPeriodOf(current);
  if (!fiscalPeriod) return null;
  const prior = facts
    .filter(
      (fact) =>
        isYtdFact(fact) &&
        fiscalPeriodOf(fact) === fiscalPeriod &&
        fact.end < current.start! &&
        (!current.filed || !fact.filed || fact.filed <= current.filed),
    )
    .sort((a, b) => a.end.localeCompare(b.end) || (a.filed ?? "").localeCompare(b.filed ?? ""))
    .at(-1);
  return prior ? { current, prior, fiscalPeriod } : null;
}

/** 회계연도 말일 목록(최신순) — NetIncomeLoss 연차 datapoint 에서. */
function fiscalYearEnds(cf: CompanyFacts): { end: string; year: number }[] {
  const ni = usd(cf, "NetIncomeLoss").filter(
    (f) => isAnnualForm(f) && isYearLong(f),
  );
  const seen = new Set<string>();
  const out: { end: string; year: number }[] = [];
  for (const f of [...ni].sort((a, b) => (a.end < b.end ? -1 : 1))) {
    if (!seen.has(f.end)) {
      seen.add(f.end);
      out.push({ end: f.end, year: Number(f.end.slice(0, 4)) });
    }
  }
  return out;
}

/** 흐름(손익·현금흐름) 연차값 — end 일치 + 1년 기간. concept 후보 순서대로. */
function durVal(cf: CompanyFacts, concepts: string[], fyEnd: string): number | null {
  for (const c of concepts) {
    const e = usd(cf, c).find((f) => f.end === fyEnd && isYearLong(f));
    if (e) return e.val;
  }
  return null;
}

/** 잔액(재무상태) 값 — end 일치(가장 마지막 보고분). */
function instVal(cf: CompanyFacts, concepts: string[], fyEnd: string): number | null {
  for (const c of concepts) {
    const arr = usd(cf, c).filter((f) => f.end === fyEnd);
    if (arr.length) return arr[arr.length - 1].val;
  }
  return null;
}

function periodDurVal(
  cf: CompanyFacts,
  concepts: string[],
  period: Fact,
): number | null {
  for (const concept of concepts) {
    const matches = usd(cf, concept).filter(
      (fact) =>
        fact.start === period.start &&
        fact.end === period.end &&
        (fact.form === "10-Q" || fact.form === "10-Q/A"),
    );
    const sameFiling = matches.find((fact) => fact.accn && fact.accn === period.accn);
    const picked = sameFiling ?? matches.sort((a, b) => (a.filed ?? "").localeCompare(b.filed ?? "")).at(-1);
    if (picked) return picked.val;
  }
  return null;
}

function periodInstVal(
  cf: CompanyFacts,
  concepts: string[],
  period: Fact,
): number | null {
  for (const concept of concepts) {
    const matches = usd(cf, concept)
      .filter(
        (fact) =>
          fact.end === period.end &&
          (!period.filed || !fact.filed || fact.filed <= period.filed),
      )
      .sort((a, b) => (a.filed ?? "").localeCompare(b.filed ?? ""));
    if (matches.length) return matches.at(-1)!.val;
  }
  return null;
}

/**
 * 같은 시점의 주식수 fact 들을 총 발행주식수로 합산.
 * 복수 클래스(버크셔 A/B 등)는 같은 end 에 클래스별 fact 가 따로 오는데, 하나만 집으면
 * A 클래스(수십만 주)를 잡아 지분율이 수천 배 부풀 수 있다(투시 순이익 억 단위 왜곡).
 * 같은 값의 중복 fact(여러 제출본 재보고)는 값 기준으로 dedupe 후 합산한다.
 * 한계: 클래스 간 경제적 가중(A=1500B 등)은 반영 못 하는 근사 — 단일 클래스는 정확.
 */
function sumClassShares(facts: Fact[]): number | null {
  if (!facts.length) return null;
  const distinct = [...new Set(facts.map((f) => f.val))];
  return distinct.reduce((s, v) => s + v, 0);
}

/** 발행주식수 — 회계연도말 us-gaap, 없으면 dei 최신(표지일 기준). 환산 없음(count). */
function sharesAt(cf: CompanyFacts, fyEnd: string): number | null {
  const us = sharesUnit(cf, "us-gaap", "CommonStockSharesOutstanding").filter(
    (f) => f.end === fyEnd,
  );
  const usSum = sumClassShares(us);
  if (usSum != null) return usSum;
  const dei = sharesUnit(cf, "dei", "EntityCommonStockSharesOutstanding");
  if (dei.length) {
    const latestEnd = [...dei].sort((a, b) => (a.end < b.end ? -1 : 1)).at(-1)!
      .end;
    return sumClassShares(dei.filter((f) => f.end === latestEnd));
  }
  return null;
}

/** 한 회계연도 → Fundamentals(₩ 환산). rate = USD→KRW. */
function buildYear(
  cf: CompanyFacts,
  fy: { end: string; year: number },
  rate: number,
  period?: Fact,
): Fundamentals {
  const e = fy.end;
  const duration = (concepts: string[]) =>
    period ? periodDurVal(cf, concepts, period) : durVal(cf, concepts, e);
  const instant = (concepts: string[]) =>
    period ? periodInstVal(cf, concepts, period) : instVal(cf, concepts, e);
  let revenue = duration(
    [
      "Revenues",
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "RevenueFromContractWithCustomerIncludingAssessedTax",
      "SalesRevenueNet",
    ],
  );
  let operatingIncome = duration(["OperatingIncomeLoss"]);
  let netIncome = duration(["NetIncomeLoss"]);
  let assets = instant(["Assets"]);
  let liabilities = instant(["Liabilities"]);
  let equity = instant(
    [
      "StockholdersEquity",
      "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
    ],
  );
  let ocf = duration(
    [
      "NetCashProvidedByUsedInOperatingActivities",
      "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
    ],
  );
  let icf = duration(
    [
      "NetCashProvidedByUsedInInvestingActivities",
      "NetCashProvidedByUsedInInvestingActivitiesContinuingOperations",
    ],
  );
  let ffcf = duration(
    [
      "NetCashProvidedByUsedInFinancingActivities",
      "NetCashProvidedByUsedInFinancingActivitiesContinuingOperations",
    ],
  );
  let capex = duration(["PaymentsToAcquirePropertyPlantAndEquipment"]);
  let dna = duration(
    [
      "DepreciationDepletionAndAmortization",
      "DepreciationAmortizationAndAccretionNet",
      "DepreciationAndAmortization",
    ],
  );
  let interestExpense = duration(["InterestExpense", "InterestExpenseDebt"]);
  const intanEx = instant(
    ["IntangibleAssetsNetExcludingGoodwill", "FiniteLivedIntangibleAssetsNet"],
  );
  const goodwill = instant(["Goodwill"]);
  let intangibles =
    intanEx != null || goodwill != null ? (intanEx ?? 0) + (goodwill ?? 0) : null;
  let retainedEarnings = instant(["RetainedEarningsAccumulatedDeficit"]);
  let receivables = instant(
    ["AccountsReceivableNetCurrent", "ReceivablesNetCurrent"],
  );
  let inventory = instant(["InventoryNet"]);
  const shares = sharesAt(cf, e); // count — 환산 없음

  if (liabilities == null && assets != null && equity != null)
    liabilities = assets - equity;
  // 현금 유출 항목은 절대값(부호 통일)
  capex = capex != null ? Math.abs(capex) : null;
  dna = dna != null ? Math.abs(dna) : null;
  interestExpense = interestExpense != null ? Math.abs(interestExpense) : null;

  // ₩ 환산(화폐성 전부 ×rate, shares 제외)
  const k = (v: number | null) => (v != null ? v * rate : null);
  revenue = k(revenue);
  operatingIncome = k(operatingIncome);
  netIncome = k(netIncome);
  assets = k(assets);
  liabilities = k(liabilities);
  equity = k(equity);
  ocf = k(ocf);
  icf = k(icf);
  ffcf = k(ffcf);
  capex = k(capex);
  dna = k(dna);
  interestExpense = k(interestExpense);
  intangibles = k(intangibles);
  retainedEarnings = k(retainedEarnings);
  receivables = k(receivables);
  inventory = k(inventory);

  const fcf = ocf != null && capex != null ? ocf - capex : null;
  // 미국은 D&A 가 공시에 깔끔 → 오너이익 자동 산출(한국과 차이).
  const ownerEarnings =
    netIncome != null && dna != null && capex != null
      ? netIncome + dna - capex
      : null;
  const roe = netIncome != null && equity && equity > 0 ? netIncome / equity : null;
  const debtRatio =
    liabilities != null && equity && equity > 0 ? liabilities / equity : null;
  const operatingMargin =
    operatingIncome != null && revenue && revenue > 0
      ? operatingIncome / revenue
      : null;
  const eps = netIncome != null && shares && shares > 0 ? netIncome / shares : null;
  const isFinancial = revenue == null;
  let confidence: "high" | "low" = "high";
  if (assets == null || equity == null || netIncome == null) confidence = "low";
  else if (
    liabilities != null &&
    Math.abs(assets - (liabilities + equity)) > Math.abs(assets) * 0.01
  )
    confidence = "low";

  return {
    year: fy.year,
    fsDiv: "연결", // 미국은 연결/개별 구분 없음 — 연결로 표기
    revenue,
    operatingIncome,
    netIncome,
    assets,
    liabilities,
    equity,
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

async function load(
  symbol: string,
): Promise<{ cf: CompanyFacts; rate: number; fys: { end: string; year: number }[] } | null> {
  const cik = await cikOf(symbol);
  if (!cik) return null;
  const cf = await fetchFacts(cik);
  if (!cf) return null;
  const fys = fiscalYearEnds(cf);
  if (!fys.length) return null;
  const rate = await getUsdKrw();
  if (!rate) return null;
  return { cf, rate, fys };
}

/** 미국 종목 최신 연간 펀더멘털(₩ 환산). 해외 6자리 아님 가정. 실패는 null. */
export async function getFundamentalsUS(
  symbol: string,
  currentYear: number,
): Promise<Fundamentals | null> {
  if (/^\d{6}$/.test(symbol)) return null;
  try {
    const loaded = await load(symbol);
    if (!loaded) return null;
    const { cf, rate, fys } = loaded;
    // year 이하의 가장 최근 회계연도(없으면 최신).
    const pick = [...fys].reverse().find((f) => f.year <= currentYear) ?? fys.at(-1)!;
    return buildYear(cf, pick, rate);
  } catch {
    return null;
  }
}

/** 최신 10-K + 10-Q 누적 - 전년 동기 10-Q 누적으로 미국 종목 TTM을 만든다. */
export async function getTtmFundamentalsUS(
  symbol: string,
  currentYear: number,
  asOfDate = new Date().toISOString().slice(0, 10),
): Promise<TtmFundamentals | null> {
  if (/^\d{6}$/.test(symbol)) return null;
  try {
    const loaded = await load(symbol);
    if (!loaded) return null;
    const { cf, rate, fys } = loaded;
    const fy = [...fys].reverse().find((item) => item.year <= currentYear) ?? fys.at(-1)!;
    const pair = selectLatestYtdPair(incomeFacts(cf), fy.end, asOfDate);
    if (!pair) return null;
    const annual: FundamentalPeriod = {
      fiscalYear: fy.year,
      fiscalPeriod: "FY",
      periodEnd: fy.end,
      data: buildYear(cf, fy, rate),
    };
    const current: FundamentalPeriod = {
      fiscalYear: pair.current.fy ?? Number(pair.current.end.slice(0, 4)),
      fiscalPeriod: pair.fiscalPeriod,
      periodEnd: pair.current.end,
      data: buildYear(
        cf,
        { end: pair.current.end, year: pair.current.fy ?? currentYear },
        rate,
        pair.current,
      ),
    };
    const prior: FundamentalPeriod = {
      fiscalYear: pair.prior.fy ?? current.fiscalYear - 1,
      fiscalPeriod: pair.fiscalPeriod,
      periodEnd: pair.prior.end,
      data: buildYear(
        cf,
        { end: pair.prior.end, year: pair.prior.fy ?? current.fiscalYear - 1 },
        rate,
        pair.prior,
      ),
    };
    return composeTtm(annual, current, prior);
  } catch {
    return null;
  }
}

/** 미국 종목 다년 펀더멘털(최신순) — companyfacts 한 번에서 구성. */
export async function getFundamentalsSeriesUS(
  symbol: string,
  currentYear: number,
  maxYears = 10,
): Promise<Fundamentals[]> {
  if (/^\d{6}$/.test(symbol)) return [];
  try {
    const loaded = await load(symbol);
    if (!loaded) return [];
    const { cf, rate, fys } = loaded;
    const chosen = fys
      .filter((f) => f.year <= currentYear)
      .slice(-maxYears)
      .reverse(); // 최신순
    return chosen.map((f) => buildYear(cf, f, rate));
  } catch {
    return [];
  }
}
