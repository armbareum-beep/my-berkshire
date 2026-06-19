import { getBusinessSectionKR } from "./dart";
import { getBusinessSectionUS } from "./edgar";

export interface CompanyProfile {
  summary: string | null;
  sector: string | null;
  industry: string | null;
  website: string | null;
  source: "DART 사업보고서" | "SEC 10-K" | "Yahoo Finance" | null;
}

function yahooCandidates(symbol: string): string[] {
  return /^\d{6}$/.test(symbol) ? [`${symbol}.KS`, `${symbol}.KQ`] : [symbol];
}

/** 회사 소개 원문을 문장 중간에서 끊지 않는 짧은 발췌로 만든다. */
export function summarizeBusinessDescription(
  value: string | null | undefined,
  maxLength = 360,
): string | null {
  const text = value?.replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.length <= maxLength) return text;

  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
  let summary = "";
  for (const sentence of sentences) {
    const next = `${summary} ${sentence.trim()}`.trim();
    if (next.length > maxLength) break;
    summary = next;
  }

  if (!summary) {
    summary = text.slice(0, maxLength).replace(/\s+\S*$/, "").trim();
  }
  return `${summary}…`;
}

/** 정기보고서 사업 섹션에서 실제 사업·제품·서비스를 설명하는 문장을 고른다. */
export function summarizeBusinessReport(
  value: string | null | undefined,
  maxLength = 520,
): string | null {
  const text = value?.trim();
  if (!text) return null;
  const keywords = [
    "사업", "제품", "서비스", "제조", "판매", "제공", "고객", "매출", "시장", "영위",
    "business", "product", "service", "manufacture", "sell", "customer", "revenue", "market",
  ];
  const candidates = text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((sentence, index) => ({
      index,
      sentence: sentence.replace(/^\s*[\dIVX가-힣]+[.)]\s*/, "").replace(/\s+/g, " ").trim(),
    }))
    .filter(({ sentence }) => sentence.length >= 35 && sentence.length <= 320)
    .map((candidate) => ({
      ...candidate,
      score: keywords.reduce(
        (score, keyword) => score + (candidate.sentence.toLowerCase().includes(keyword) ? 1 : 0),
        0,
      ),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 6)
    .sort((a, b) => a.index - b.index);

  const selected: string[] = [];
  let length = 0;
  for (const { sentence } of candidates) {
    if (selected.length >= 3 || length + sentence.length > maxLength) continue;
    selected.push(sentence);
    length += sentence.length + 1;
  }
  return selected.length > 0 ? selected.join(" ") : summarizeBusinessDescription(text, maxLength);
}

async function fetchYahooProfile(symbol: string): Promise<CompanyProfile | null> {
  const url = new URL(
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}`,
  );
  url.searchParams.set("modules", "assetProfile");
  url.searchParams.set("lang", "ko-KR");
  url.searchParams.set("region", "KR");

  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    next: { revalidate: 604800 },
  });
  if (!response.ok) return null;

  const json = await response.json();
  const profile = json?.quoteSummary?.result?.[0]?.assetProfile;
  if (!profile) return null;

  const stringOrNull = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : null;

  return {
    summary: summarizeBusinessDescription(profile.longBusinessSummary),
    sector: stringOrNull(profile.sector),
    industry: stringOrNull(profile.industry),
    website: stringOrNull(profile.website),
    source: "Yahoo Finance",
  };
}

async function fetchYahooSearchProfile(
  symbol: string,
): Promise<CompanyProfile | null> {
  const url = new URL("https://query1.finance.yahoo.com/v1/finance/search");
  url.searchParams.set("q", symbol);
  url.searchParams.set("quotesCount", "5");
  url.searchParams.set("newsCount", "0");
  url.searchParams.set("lang", "ko-KR");
  url.searchParams.set("region", "KR");

  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    next: { revalidate: 604800 },
  });
  if (!response.ok) return null;

  const json = await response.json();
  const quote = json?.quotes?.find(
    (item: { symbol?: unknown }) =>
      typeof item.symbol === "string" &&
      item.symbol.toUpperCase() === symbol.toUpperCase(),
  );
  if (!quote) return null;

  const stringOrNull = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : null;
  const sector = stringOrNull(quote.sector);
  const industry = stringOrNull(quote.industry);
  if (!sector && !industry) return null;

  return { summary: null, sector, industry, website: null, source: "Yahoo Finance" };
}

async function getYahooProfile(symbol: string): Promise<CompanyProfile | null> {
  for (const candidate of yahooCandidates(symbol)) {
    try {
      const profile = await fetchYahooProfile(candidate);
      if (profile) return profile;
    } catch {
      // 한국 종목은 KOSPI 다음 KOSDAQ 후보를 이어서 확인한다.
    }
    try {
      const profile = await fetchYahooSearchProfile(candidate);
      if (profile) return profile;
    } catch {
      // 다음 거래소 후보 또는 저장된 종목 메타데이터로 대체한다.
    }
  }
  return null;
}

export async function getCompanyProfile(
  symbol: string,
): Promise<CompanyProfile | null> {
  const isKorean = /^\d{6}$/.test(symbol);
  const [section, yahoo] = await Promise.all([
    isKorean ? getBusinessSectionKR(symbol) : getBusinessSectionUS(symbol),
    getYahooProfile(symbol),
  ]);
  const reportSummary = summarizeBusinessReport(section);
  if (!reportSummary) return yahoo;

  return {
    summary: reportSummary,
    sector: yahoo?.sector ?? null,
    industry: yahoo?.industry ?? null,
    website: yahoo?.website ?? null,
    source: isKorean ? "DART 사업보고서" : "SEC 10-K",
  };
}
