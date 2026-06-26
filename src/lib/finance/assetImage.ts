/**
 * 자산 → 유형별 로고 이미지 후보 결정(순수 함수).
 *
 * 화면의 종목 아이콘을 "동그라미 안 글자" 폴백 대신 자산 유형에 맞는 이미지로:
 *  · 기업(company) = 종목 로고(FMP, 티커/코드 기반 — 키 불필요, 미존재는 404)
 *  · 운용사(manager, ETF) = 운용사 favicon
 *  · 지수/국가(index) = 로컬 국기 SVG(public/flags)
 *  · 환율(fx) = 기준통화 국기 SVG
 *  · 암호화폐(crypto) = 로컬 코인 SVG(public/coins)
 *
 * `srcs`는 시도 순서. 앞 후보가 404/로드 실패면 다음 후보, 다 실패하면 텍스트 폴백
 * (Avatar 가 onError 로 순차 시도). 외부 이미지(FMP·favicon)는 기존 Google favicon 과
 * 같은 범주 — 신규 npm 의존 아님. 추측 이미지는 만들지 않는다(미존재는 폴백).
 *
 * 모든 아바타 사용처가 이 한 함수를 거쳐 동일 입력→동일 후보로 일관(FR-004).
 */

import { PRESET_QUOTES, fxCodeFromSymbol } from "./quotes";
import { currencyMeta } from "./currencies";
import { etfManager } from "./brandColor";

export type AssetKind = "company" | "manager" | "index" | "crypto" | "fx";

export interface AssetImage {
  kind: AssetKind;
  /** 시도할 이미지 URL 후보(앞에서부터). 모두 실패하거나 비면 텍스트 폴백. */
  srcs: string[];
  /** 접근성 텍스트. */
  alt: string;
  /**
   * 원형 아바타 안 배치.
   *  - "fill": 원을 꽉 채움(회사 브랜드 마크 — 모서리 여백이라 클립돼도 무방).
   *  - "inset": 원 안에 작게 내접(국기·운용사 favicon — 직사각/여백 없어 꽉 채우면 잘림).
   */
  fit: "fill" | "inset";
}

/** Google s2 favicon(도메인 기반, 키 불필요). 운용사·증권사 로고 폴백에 공통 사용. */
export function gfavicon(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}

/** FMP 종목 로고 — 티커/코드 기반(키 불필요). 미존재 티커는 404 → 다음 후보/폴백. */
function fmpLogo(ticker: string): string {
  return `https://financialmodelingprep.com/image-stock/${ticker}.png`;
}

/**
 * 토스 종목 로고 CDN(국내 6자리 코드) — 주식·ETF 모두 보유, 고품질·일관.
 * 셀프 호스팅(public/logos)이 1순위라 보유 종목은 이 후보까지 안 가지만, 미보유 카탈로그·검색
 * 종목은 sync 없이도 이 CDN으로 로고가 뜬다. 차단되면 다음 후보(운용사 favicon)·글자로 폴백.
 */
function tossLogo(code: string): string {
  return `https://static.toss.im/png-icons/securities/icn-sec-fill-${code}.png`;
}

/**
 * 같은 출처(우리 도메인) 로고 프록시 — 광고차단/핫링크 문제를 없앤다. 서버(/api/logo)가
 * 외부 소스를 받아 CDN 캐시·서빙하므로, 미보유·검색 종목도 sync 없이 로고가 뜬다.
 */
function apiLogo(symbol: string): string {
  return `/api/logo?symbol=${encodeURIComponent(symbol)}`;
}

/**
 * 로고 프록시(/api/logo)가 **서버에서** 시도할 외부 소스 목록(앞에서부터). 국내 6자리=토스
 * CDN(주식·ETF 전부)→FMP→큐레이트 favicon, 해외=FMP. 지수·환율·코인은 로컬이라 빈 배열.
 * 프록시 전용(클라이언트 후보엔 안 들어감 — 재귀 방지).
 */
export function externalLogoSources(symbol: string): string[] {
  const sym = symbol.trim();
  const upper = sym.toUpperCase();
  if (!sym || upper.endsWith("-USD") || sym.startsWith("^") || sym.includes("=")) return [];
  if (/^\d{6}$/.test(sym)) {
    const srcs = [tossLogo(sym), fmpLogo(`${sym}.KS`), fmpLogo(`${sym}.KQ`)];
    if (KR_FALLBACK_DOMAINS[sym]) srcs.push(gfavicon(KR_FALLBACK_DOMAINS[sym]));
    return srcs;
  }
  if (upper.includes("/")) return [fmpLogo(upper.replace("/", "-")), fmpLogo(upper.replace("/", "."))];
  return [fmpLogo(upper)];
}

/**
 * 셀프 호스팅 로고(public/logos/{symbol}.svg|png) — 최우선 후보.
 * 자기 도메인이라 광고차단/네트워크에 안 막힌다. 파일 없으면 404 → 다음 후보.
 * `npm run sync:logos`로 자동 저장(png)하거나, 직접 파일(svg/png)을 넣어도 된다.
 */
function localLogos(symbol: string): string[] {
  const e = logoSlug(symbol);
  return [`/logos/${e}.svg`, `/logos/${e}.png`];
}

/**
 * 로고 파일명/URL용 안전 슬러그 — 영숫자·`.`·`-`만 유지하고 나머지(`/` 등)는 `_`로 치환.
 * 정상 티커/코드(AAPL·005930)는 그대로. `BRK/A` 같은 슬래시 심볼이 경로를 깨거나
 * %2F 인코딩으로 정적 서빙에 실패하던 문제를 막는다. 셀프 호스팅 측(sync:logos)과 동일 규칙.
 */
export function logoSlug(symbol: string): string {
  return symbol.replace(/[^A-Za-z0-9.\-]/g, "_");
}

/** 지수 국가코드 → 국기 SVG 파일명(public/flags/{cc}.svg 존재분만). */
const COUNTRY_CC: Record<string, string> = {
  KR: "kr",
  US: "us",
  JP: "jp",
  EU: "eu",
};

/** 코인 심볼 → 로컬 코인 SVG 슬러그(public/coins/{slug}.svg 존재분만). */
const COIN_SLUG: Record<string, string> = {
  BTC: "btc",
  ETH: "eth",
};

/** FMP에 로고가 없는 국내 종목용 큐레이트 favicon 폴백(확실한 도메인만 등록). */
const KR_FALLBACK_DOMAINS: Record<string, string> = {
  "462870": "shiftup.co.kr", // 시프트업 (FMP 미보유)
};

/** 심볼(또는 PRESET)에서 지수 국가코드 추론. */
function indexCountry(symbol: string): string | undefined {
  return PRESET_QUOTES.find((q) => q.symbol === symbol)?.country;
}

/**
 * 자산 유형 분류 + 유형별 이미지 URL 후보 결정.
 * @param symbol 코드(6자리)·티커·`^지수`·`{CCY}KRW=X` 환율·`-USD` 크립토 등
 * @param name 표시명(폴백 레이블·alt)
 * @param opts.country 지수 국기 힌트(PRESET country). 없으면 심볼로 추론
 */
export function assetImage(
  symbol?: string,
  name?: string,
  opts?: { country?: string },
): AssetImage {
  const alt = name ?? symbol ?? "";
  const sym = symbol?.trim() ?? "";
  const upper = sym.toUpperCase();

  // 1) 암호화폐 — `-USD` 접미 또는 코인 세트
  if (upper.endsWith("-USD")) {
    const slug = COIN_SLUG[upper.replace("-USD", "")];
    return { kind: "crypto", srcs: slug ? [`/coins/${slug}.svg`] : [], alt, fit: "fill" };
  }

  // 2) 지수/국가 — `^` 시작 (국기는 내접)
  if (sym.startsWith("^")) {
    const country = opts?.country ?? indexCountry(sym);
    const cc = country ? COUNTRY_CC[country] : undefined;
    return { kind: "index", srcs: cc ? [`/flags/${cc}.svg`] : [], alt, fit: "inset" };
  }

  // 3) 환율 쌍 `{CCY}KRW=X` → 기준통화 국기 (내접)
  const fxCode = fxCodeFromSymbol(sym);
  if (fxCode) {
    const cc = currencyMeta(fxCode).cc;
    return { kind: "fx", srcs: cc ? [`/flags/${cc}.svg`] : [], alt, fit: "inset" };
  }

  // 4) 국내 6자리 코드 — 로컬(public/logos) 1순위 → 로고 프록시(/api/logo). ETF는 내접.
  if (/^\d{6}$/.test(sym)) {
    const srcs = [...localLogos(sym), apiLogo(sym)];
    // 운용사(ETF) 마크는 여백 없어 내접(TIGER·ACE 등), 기업 로고는 꽉 채움.
    return etfManager(sym, name)
      ? { kind: "manager", srcs, alt, fit: "inset" }
      : { kind: "company", srcs, alt, fit: "fill" };
  }

  // 5) 해외 기업 티커 — 로컬 → 로고 프록시(/api/logo).
  if (sym) return { kind: "company", srcs: [...localLogos(sym), apiLogo(sym)], alt, fit: "fill" };
  return { kind: "company", srcs: [], alt, fit: "fill" };
}
