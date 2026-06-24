/**
 * 종목 로고 셀프 호스팅 싱크 — `securities` 테이블의 심볼 로고를 받아
 * public/logos/{symbol}.png 로 저장한다. 자기 도메인의 /logos 는 광고차단/네트워크에
 * 막히지 않으므로(외부 CDN과 달리) 항상 뜬다. 핀테크가 로고를 직접 호스팅하는 방식.
 *
 * 소스: 기업=FMP(티커/코드), ETF=운용사 favicon(google.com). 국내 ETF placeholder는 제외.
 * 실행: npm run sync:logos   (직접 public/logos/{코드}.png 를 넣어도 됨 — 그 파일이 1순위)
 */

import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import type { Database } from "../src/lib/supabase/database.types";
import { etfManager } from "../src/lib/finance/brandColor";

loadEnvConfig(process.cwd());

const PUB_DIR = resolve("public/logos");
/** FMP가 국내 ETF 등에 주는 동일 generic placeholder(md5) — 저장하지 않는다. */
const FMP_PLACEHOLDER_MD5 = "c8eeb10a353dd6faceabaa55106a4fd7";

function fmp(ticker: string): string {
  return `https://financialmodelingprep.com/image-stock/${ticker}.png`;
}
function favicon(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}

/** 심볼 → 시도할 로고 URL 후보(앞에서부터). 지수·환율·코인은 로컬 SVG라 제외. */
function candidateUrls(symbol: string, name: string): string[] {
  if (symbol.endsWith("-USD") || symbol.startsWith("^") || symbol.includes("=")) return [];
  if (/^\d{6}$/.test(symbol)) {
    const mgr = etfManager(symbol, name);
    if (mgr) return mgr.domain ? [favicon(mgr.domain)] : [];
    return [fmp(`${symbol}.KS`), fmp(`${symbol}.KQ`)];
  }
  return [fmp(symbol.toUpperCase())];
}

async function fetchLogo(urls: string[]): Promise<Buffer | null> {
  for (const u of urls) {
    try {
      const res = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) continue;
      if (!(res.headers.get("content-type") ?? "").startsWith("image")) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 200) continue; // 빈/깨진 이미지
      if (createHash("md5").update(buf).digest("hex") === FMP_PLACEHOLDER_MD5) continue;
      return buf;
    } catch {
      /* 다음 후보 */
    }
  }
  return null;
}

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required in .env.local`);
  return v;
}

async function main() {
  const supabase = createClient<Database>(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data, error } = await supabase.from("securities").select("symbol, name");
  if (error) throw error;
  const rows = (data ?? []).filter((r) => Boolean(r.symbol));
  if (rows.length === 0) {
    console.log("securities 테이블에 심볼이 없습니다.");
    return;
  }

  mkdirSync(PUB_DIR, { recursive: true });
  let saved = 0;
  const missing: string[] = [];

  for (const { symbol, name } of rows) {
    const urls = candidateUrls(symbol, name ?? symbol);
    if (urls.length === 0) continue; // 지수·환율·코인
    const buf = await fetchLogo(urls);
    if (!buf) {
      missing.push(symbol);
      continue;
    }
    writeFileSync(resolve(PUB_DIR, `${symbol}.png`), buf);
    saved += 1;
    console.log(`✓ ${symbol}  ${name ?? ""}`);
  }

  console.log(`\n로고 ${saved}개 저장 → public/logos/. 미발견 ${missing.length}개(글자 폴백): ${missing.join(", ")}`);
  console.log("미발견 종목은 public/logos/{코드}.png 로 직접 넣으면 바로 뜹니다.");
}

main().catch((e) => {
  console.error("로고 싱크 실패:", e);
  process.exitCode = 1;
});
