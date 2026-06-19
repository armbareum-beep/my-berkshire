import type { Disclosure } from "./dart";
import { getDisclosuresForSymbols } from "./dart";
import { getDisclosuresUS } from "./edgar";

export type DisclosurePriority = "important" | "reference" | "noise";

export interface FeedDisclosure extends Disclosure {
  priority: DisclosurePriority;
  readKey: string;
}

const IMPORTANT_SEC = /^(8-K|8-K\/A)(\s|·|$)/;
const REFERENCE_SEC = /^(10-K|10-Q|10-K\/A|10-Q\/A)(\s|·|$)/;

/** 중요도는 누락 없는 필터를 위한 제목 기반 분류이며 투자 판단이 아니다. */
export function disclosurePriority(disclosure: Disclosure): DisclosurePriority {
  if (disclosure.hint?.tone === "warn" || IMPORTANT_SEC.test(disclosure.title))
    return "important";
  if (disclosure.hint || REFERENCE_SEC.test(disclosure.title)) return "reference";
  return "noise";
}

export function prepareDisclosureFeed(
  disclosures: Disclosure[],
): FeedDisclosure[] {
  const seen = new Set<string>();
  return disclosures
    .filter((disclosure) => {
      if (!disclosure.rceptNo || seen.has(disclosure.rceptNo)) return false;
      seen.add(disclosure.rceptNo);
      return true;
    })
    .map((disclosure) => ({
      ...disclosure,
      priority: disclosurePriority(disclosure),
      readKey: `disc:${disclosure.rceptNo}`,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function getPortfolioDisclosureFeed(
  symbols: string[],
  fromDate: string,
  toDate: string,
  perSymbol = 20,
  total = 200,
): Promise<FeedDisclosure[]> {
  const unique = [...new Set(symbols)];
  const korean = unique.filter((symbol) => /^\d{6}$/.test(symbol));
  const overseas = unique.filter((symbol) => !/^\d{6}$/.test(symbol));
  const [dart, secResults] = await Promise.all([
    getDisclosuresForSymbols(korean, fromDate, toDate, perSymbol, total),
    Promise.allSettled(
      overseas.map((symbol) =>
        getDisclosuresUS(symbol, fromDate, toDate, perSymbol),
      ),
    ),
  ]);
  const sec = secResults.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  return prepareDisclosureFeed([...dart, ...sec]).slice(0, total);
}
