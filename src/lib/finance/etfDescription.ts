import type { EtfHolding, EtfSector } from "./etfStats";

export interface EtfDescription {
  text: string;
  tags: string[];
  basis: "index" | "composition" | "name";
}

const CORE_INDEX_DESCRIPTION: Record<string, string> = {
  KOSPI200: "한국 유가증권시장을 대표하는 대형 우량주 200종목으로 구성된 지수입니다.",
  "S&P500": "미국을 대표하는 대형 상장기업 약 500곳으로 구성된 지수입니다.",
  NASDAQ100: "나스닥 상장 비금융 대형기업 100곳으로 구성된 지수입니다.",
};

const ISSUER_PREFIX = /^(?:KODEX|TIGER|ACE|RISE|KBSTAR|ARIRANG|HANARO|KOSEF|SOL|PLUS|TIMEFOLIO|KINDEX|히어로즈|FOCUS|WOORI|UNICORN|TREX|마이티)\s*/i;

function productExposure(name: string): string {
  return name
    .replace(ISSUER_PREFIX, "")
    .replace(/\((?:H|합성H?|환헤지)\)/gi, " ")
    .replace(/(?:인버스\s*2X|인버스|레버리지|2X|액티브|TRF?|합성)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function strategyTags(name: string): string[] {
  const tags: string[] = [];
  if (/인버스\s*2X|곱버스/i.test(name)) tags.push("-2배 인버스");
  else if (/인버스/i.test(name)) tags.push("인버스");
  else if (/레버리지|2X/i.test(name)) tags.push("레버리지");
  if (/액티브/i.test(name)) tags.push("액티브");
  if (/\(H\)|환헤지/i.test(name)) tags.push("환헤지");
  else if (/미국|일본|중국|차이나|유럽|글로벌/i.test(name)) tags.push("환노출 가능");
  if (/채권|국고채|국채|회사채|단기채/i.test(name)) tags.push("채권형");
  else if (/금|은선물|원유|구리|원자재/i.test(name)) tags.push("원자재형");
  return tags;
}

export function buildEtfDescription({
  name,
  trackedIndex,
  sectors,
  holdings,
}: {
  name: string;
  trackedIndex: string | null;
  sectors: EtfSector[];
  holdings: EtfHolding[];
}): EtfDescription {
  const tags = strategyTags(name);
  const exposure = productExposure(name);
  const sentences: string[] = [];

  if (trackedIndex) {
    sentences.push(`${name}은 ${trackedIndex} 지수의 수익률을 추종하는 ETF입니다.`);
    const indexDescription = CORE_INDEX_DESCRIPTION[trackedIndex.toUpperCase()];
    if (indexDescription) sentences.push(indexDescription);
  } else if (exposure) {
    const direction = tags.includes("인버스") || tags.includes("-2배 인버스")
      ? "반대 방향의 수익률을 목표로 하는"
      : tags.includes("레버리지")
        ? "일간 수익률을 확대해 추종하는"
        : "관련 자산에 투자하는";
    sentences.push(`${name}은 상품명 기준으로 ${exposure} ${direction} ETF입니다.`);
  } else {
    sentences.push(`${name}은 여러 자산에 분산 투자하는 ETF입니다.`);
  }

  if (sectors.length > 0) {
    sentences.push(
      `현재 비중이 큰 영역은 ${sectors.slice(0, 3).map((item) => `${item.name} ${(item.weight * 100).toFixed(1)}%`).join(", ")}입니다.`,
    );
  }
  if (holdings.length > 0) {
    sentences.push(
      `상위 편입 종목은 ${holdings.slice(0, 3).map((item) => item.name || item.symbol).join(", ")}입니다.`,
    );
  }

  return {
    text: sentences.join(" "),
    tags: [trackedIndex ? `${trackedIndex} 추종` : null, "ETF", ...tags].filter(
      (tag): tag is string => Boolean(tag),
    ),
    basis: trackedIndex ? "index" : sectors.length > 0 || holdings.length > 0 ? "composition" : "name",
  };
}
