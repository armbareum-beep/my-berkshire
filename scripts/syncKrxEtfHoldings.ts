/**
 * KRX ETF 구성종목 싱크 — Playwright context.request (CSP 우회)
 *
 * page.evaluate() 대신 context.request.fetch()를 사용해
 * 브라우저 CSP 제약 없이 KRX API를 직접 호출.
 *
 * 실행:
 *   npm run sync:krx-holdings
 *
 * 처음 로그인:
 *   $env:KRX_INTERACTIVE="1"; npm run sync:krx-holdings
 */

import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import { chromium, type BrowserContext } from "playwright";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

loadEnvConfig(process.cwd());

const KRX_HOME = "https://data.krx.co.kr/contents/MDC/MAIN/main/index.cmd";
// ETF PDF 구성종목 화면 (13108) — Referer 및 세션 워밍업용
const KRX_DATA_PAGE =
  "https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201030108";
const KRX_API_URL = "https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd";
const KRX_STORAGE_STATE = resolve(process.env.KRX_STORAGE_STATE ?? ".krx-storage-state.json");
const CHROME_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const ETF_LIST_BLD = "dbms/MDC/STAT/standard/MDCSTAT04301";
// PDF 상위10종목 (화면 13108) — 캡처로 확인된 bld
const HOLDINGS_BLD = "dbms/MDC/STAT/standard/MDCSTAT05001";


type KrxRow = Record<string, string | number | null | undefined>;

interface HoldingItem {
  symbol: string;
  name: string;
  weight: number;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 가 .env.local 에 없습니다`);
  return value;
}

function kstDateDaysAgo(daysAgo: number): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10).replaceAll("-", "");
}

function text(row: KrxRow, keys: string[]): string {
  for (const key of keys) {
    const v = row[key];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

function parseWeight(raw: string): number | null {
  const n = Number(raw.replaceAll(",", "").replace("%", "").trim());
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n / 100;
}

/** CSP 우회: page.evaluate 대신 context.request 사용 */
async function krxPost(
  ctx: BrowserContext,
  bld: string,
  params: Record<string, string>,
  debugTag?: string,
): Promise<KrxRow[]> {
  const body = new URLSearchParams({ bld, locale: "ko_KR", csvxls_isNo: "false", ...params });
  const res = await ctx.request.fetch(KRX_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "Referer": KRX_DATA_PAGE,
    },
    data: body.toString(),
    timeout: 60_000,
  });

  const raw = await res.text();

  if (process.env.DEBUG_KRX && debugTag) {
    console.log(`  [${debugTag}] HTTP ${res.status()}: ${raw.slice(0, 200)}`);
  }

  if (raw.includes("LOGOUT")) throw new Error("KRX session expired (LOGOUT)");
  if (!res.ok()) return [];

  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return []; }

  const p = payload as Record<string, unknown>;
  if ((p?.result as Record<string, unknown>)?.code === "LOGOUT") throw new Error("KRX session expired");

  if (process.env.DEBUG_KRX && debugTag && Array.isArray(p?.output)) {
    const rows = p.output as KrxRow[];
    if (rows.length > 0) {
      console.log(`  [${debugTag}] output ${rows.length}개 / 필드: ${Object.keys(rows[0]).join(", ")}`);
    }
  }

  return Array.isArray(p?.output) ? (p.output as KrxRow[]) : [];
}

async function fetchIsuCodeMap(ctx: BrowserContext, tradeDate: string): Promise<Map<string, string>> {
  const rows = await krxPost(ctx, ETF_LIST_BLD, { trdDd: tradeDate, share: "1", money: "1" }, "ISU_MAP");
  const map = new Map<string, string>();
  for (const row of rows) {
    const srt = text(row, ["ISU_SRT_CD"]);
    const full = text(row, ["ISU_CD"]);
    if (/^\d{6}$/.test(srt) && full) map.set(srt, full);
  }
  return map;
}

/** PDF 상위10종목 가져오기 (MDCSTAT05001 확인된 bld) */
async function fetchHoldings(
  ctx: BrowserContext,
  isuCd: string,
  tradeDate: string,
): Promise<KrxRow[]> {
  const rows = await krxPost(
    ctx,
    HOLDINGS_BLD,
    { isuCd, trdDd: tradeDate, share: "1", money: "1" },
    process.env.DEBUG_KRX ? "HOLDINGS" : undefined,
  );
  // 당일 데이터 없으면 전날까지 최대 5일 재시도
  if (rows.length > 0) return rows;
  for (let i = 2; i <= 6; i++) {
    const alt = kstDateDaysAgo(i);
    const r2 = await krxPost(
      ctx,
      HOLDINGS_BLD,
      { isuCd, trdDd: alt, share: "1", money: "1" },
      process.env.DEBUG_KRX ? `HOLDINGS:${alt}` : undefined,
    );
    if (r2.length > 0) return r2;
  }
  return [];
}

function parseHoldings(rows: KrxRow[]): HoldingItem[] {
  // 1차: COMPST_RTO 로 비중 파싱
  type Raw = { symbol: string; name: string; weight: number | null; valu: number };
  const parsed: Raw[] = rows.flatMap((row) => {
    const sym = text(row, [
      "COMPST_ISU_CD", "HOLD_ISU_SRT_CD", "HOLD_ISU_CD",
      "ISU_SRT_CD", "ISU_CD", "STCK_ISU_SRT_CD", "STK_SRT_CD", "SRT_CD",
    ]);
    const name = text(row, [
      "COMPST_ISU_NM", "HOLD_ISU_NM", "HOLD_ISU_ABBRV",
      "ISU_NM", "ISU_ABBRV", "STCK_ISU_NM", "STK_NM",
    ]);
    if (!sym) return [];
    const weightRaw = text(row, [
      "COMPST_RTO", "COMPST_RT", "WGHT", "HOLD_RT", "STOC_RT",
      "BND_RT", "COMPST_RMNDR_RT", "WGHT_RT", "MKTVAL_RT",
    ]);
    const weight = parseWeight(weightRaw);
    const valuRaw = text(row, ["VALU_AMT", "COMPST_AMT", "MKT_VAL"]);
    const valu = Number(valuRaw.replaceAll(",", "")) || 0;
    return [{ symbol: sym, name: name || sym, weight, valu }];
  });

  // 2차: COMPST_RTO 가 대부분 0이면 VALU_AMT 기반으로 비중 재계산
  const validWeight = parsed.filter((r) => r.weight !== null && r.weight > 0);
  if (validWeight.length < 3) {
    const totalValu = parsed.reduce((s, r) => s + r.valu, 0);
    if (totalValu > 0) {
      return parsed
        .filter((r) => r.valu > 0)
        .map((r) => ({ symbol: r.symbol, name: r.name, weight: r.valu / totalValu }))
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 10);
    }
  }

  return validWeight
    .sort((a, b) => b.weight! - a.weight!)
    .slice(0, 10)
    .map((r) => ({ symbol: r.symbol, name: r.name, weight: r.weight! }));
}

/** KRX_CAPTURE=1 모드: 브라우저 열어두고 사용자가 ETF 화면 클릭 → bld 자동 캡처 */
async function captureMode() {
  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  try {
    const ctx = await browser.newContext({
      locale: "ko-KR",
      userAgent: CHROME_USER_AGENT,
      extraHTTPHeaders: { "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8" },
      storageState: existsSync(KRX_STORAGE_STATE) ? KRX_STORAGE_STATE : undefined,
    });
    const page = await ctx.newPage();

    // 모든 API 요청/응답 가로채기 (중복 없이)
    const captured = new Map<string, string>(); // bld → params

    page.on("request", (req) => {
      if (!req.url().includes("getJsonData.cmd") || req.method() !== "POST") return;
      try {
        const body = new URLSearchParams(req.postData() ?? "");
        const bld = body.get("bld") ?? "";
        if (!bld || captured.has(bld)) return;
        const params = [...body.entries()]
          .filter(([k]) => k !== "locale" && k !== "csvxls_isNo")
          .map(([k, v]) => `${k}=${v}`)
          .join(" | ");
        captured.set(bld, params);
        console.log(`\n★ bld: ${bld.split("/").pop()}`);
        console.log(`   params: ${params}`);
      } catch { /* ignore */ }
    });

    page.on("response", async (res) => {
      if (!res.url().includes("getJsonData.cmd")) return;
      try {
        const text = await res.text();
        const json = JSON.parse(text) as Record<string, unknown>;
        const rows = Array.isArray(json?.output) ? json.output as KrxRow[] : [];
        if (rows.length > 0) {
          const keys = Object.keys(rows[0]);
          console.log(`   → ${rows.length}행 / 필드: ${keys.join(", ")}`);
          console.log(`   → 첫행: ${JSON.stringify(rows[0]).slice(0, 200)}`);
        } else {
          console.log(`   → 응답 있으나 output 비어있음 (HTTP ${res.status()})`);
        }
      } catch { /* ignore */ }
    });

    // 먼저 홈으로 로그인 확인
    await page.goto(KRX_HOME, { waitUntil: "networkidle", timeout: 60_000 });

    if (page.url().includes("MDCCOMS001")) {
      console.log("KRX 로그인이 필요합니다. 브라우저에서 로그인하세요...");
      await page.waitForURL((url) => !url.href.includes("MDCCOMS001"), { timeout: 300_000 });
      await ctx.storageState({ path: KRX_STORAGE_STATE });
    }

    // 13105 개별종목 종합정보로 바로 이동 시도
    const ETF_13105 = "https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC020103010501";
    await page.goto(ETF_13105, { waitUntil: "networkidle", timeout: 30_000 }).catch(() => {});

    console.log("\n========================================");
    console.log(`현재 URL: ${page.url()}`);
    console.log("화면 13105 개별종목 종합정보가 열렸으면:");
    console.log("  → KODEX 200 검색 → 조회 → PDF 상위10종목 탭 클릭");
    console.log("화면이 안 열렸으면 왼쪽 메뉴에서:");
    console.log("  증권상품 → ETF → 세부안내 → 개별종목 종합정보");
    console.log("API bld와 응답 데이터가 위에 ★ 표시로 출력됩니다.");
    console.log("완료 후 이 터미널에서 Ctrl+C 누르세요.");
    console.log("========================================\n");

    await new Promise((r) => setTimeout(r, 10 * 60 * 1000)); // 10분 대기
  } finally {
    await browser.close();
  }
}

async function main() {
  if (process.env.KRX_CAPTURE === "1") { await captureMode(); return; }

  const interactive = process.env.KRX_INTERACTIVE === "1";

  const supabase = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const browser = await chromium.launch({
    headless: !interactive,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  try {
    const ctx = await browser.newContext({
      locale: "ko-KR",
      userAgent: CHROME_USER_AGENT,
      extraHTTPHeaders: { "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8" },
      storageState: existsSync(KRX_STORAGE_STATE) ? KRX_STORAGE_STATE : undefined,
    });
    const page = await ctx.newPage();

    // 세션 확인: KRX 홈 이동 후 테스트 API 호출
    await page.goto(KRX_HOME, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForTimeout(1_000);

    // URL 기반 감지 대신 API로 직접 로그인 확인
    const testBody = new URLSearchParams({
      bld: ETF_LIST_BLD, locale: "ko_KR", trdDd: kstDateDaysAgo(1), share: "1", money: "1", csvxls_isNo: "false",
    });
    const testRes = await ctx.request.fetch(KRX_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" },
      data: testBody.toString(),
      timeout: 15_000,
    }).catch(() => null);
    const testText = await testRes?.text().catch(() => "") ?? "";
    const isLoggedOut = testText.includes("LOGOUT") || !testRes?.ok();

    if (isLoggedOut) {
      if (!interactive) throw new Error("KRX 세션 만료. $env:KRX_INTERACTIVE=1 로 실행해 다시 로그인하세요.");
      console.log("KRX 세션 만료. 브라우저에서 로그인 후 Enter 누르세요...");
      // 브라우저가 열려 있으므로 사용자가 로그인 가능
      await new Promise<void>((resolve) => {
        process.stdin.once("data", () => resolve());
        console.log("(로그인 완료 후 터미널에서 Enter)");
      });
      await ctx.storageState({ path: KRX_STORAGE_STATE });
    }

    // 워밍업
    await page.goto(KRX_DATA_PAGE, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForTimeout(1_000);

    const tradeDate = process.env.KRX_TRADE_DATE?.replaceAll("-", "") ?? kstDateDaysAgo(1);
    console.log(`기준일: ${tradeDate}`);

    // 1단계: ISU코드 매핑
    console.log("ETF ISU코드 매핑 중...");
    const isuMap = await fetchIsuCodeMap(ctx, tradeDate);
    if (isuMap.size === 0) {
      const d2 = kstDateDaysAgo(2);
      console.log(`  ${tradeDate} 없음, ${d2} 재시도...`);
      const m2 = await fetchIsuCodeMap(ctx, d2);
      m2.forEach((v, k) => isuMap.set(k, v));
    }
    console.log(`  ${isuMap.size}개 ETF ISU코드 확보`);

    // 2단계: 전체 ETF 구성종목 저장
    const fetchedAt = new Date().toISOString();
    const sourceDate = `${tradeDate.slice(0, 4)}-${tradeDate.slice(4, 6)}-${tradeDate.slice(6, 8)}`;
    let synced = 0;
    let skipped = 0;

    // KRX_SINGLE_SYMBOL: 단일 테스트 / 기본: ISU맵 전체 (871개)
    const allSymbols = process.env.KRX_SINGLE_SYMBOL
      ? [process.env.KRX_SINGLE_SYMBOL]
      : [...isuMap.keys()];

    // 이미 오늘 저장된 심볼 조회 → 건너뜀 (세션 만료 후 재실행용)
    const { data: alreadySaved } = await supabase
      .from("etf_holdings_cache")
      .select("symbol")
      .eq("source_date", sourceDate);
    const savedSet = new Set((alreadySaved ?? []).map((r) => r.symbol));
    const symbolsToSync = allSymbols.filter((s) => !savedSet.has(s));
    if (savedSet.size > 0) console.log(`  이미 저장된 ${savedSet.size}개 건너뜀, ${symbolsToSync.length}개 남음`);

    // 세션 갱신: KRX 페이지 재이동 (50개마다)
    async function refreshSession() {
      await page.goto(KRX_DATA_PAGE, { waitUntil: "networkidle", timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(800);
      await ctx.storageState({ path: KRX_STORAGE_STATE });
    }

    console.log("\nETF 구성종목 저장 중...");
    for (let i = 0; i < symbolsToSync.length; i++) {
      // 50개마다 세션 갱신
      if (i > 0 && i % 50 === 0) {
        process.stdout.write(`  [세션 갱신 중...]\n`);
        await refreshSession();
      }

      const symbol = symbolsToSync[i];
      process.stdout.write(`  ${symbol} ... `);
      const fullIsuCd = isuMap.get(symbol);
      if (!fullIsuCd) { console.log("ISU코드 없음"); skipped++; continue; }

      let rows: KrxRow[];
      try {
        rows = await fetchHoldings(ctx, fullIsuCd, tradeDate);
      } catch (e) {
        console.log(`오류: ${(e as Error).message.slice(0, 60)}`); skipped++; continue;
      }
      if (rows.length === 0) { console.log("데이터 없음"); skipped++; continue; }

      const holdings = parseHoldings(rows);
      if (holdings.length === 0) {
        // 빈 배열로 저장 → 다음 실행에서 건너뜀
        await supabase.from("etf_holdings_cache").upsert(
          { symbol, holdings: [], source_date: sourceDate, fetched_at: fetchedAt },
          { onConflict: "symbol" },
        );
        console.log("구성종목 없음(저장됨)"); skipped++; continue;
      }

      const { error } = await supabase.from("etf_holdings_cache").upsert(
        { symbol, holdings, source_date: sourceDate, fetched_at: fetchedAt },
        { onConflict: "symbol" },
      );
      if (error) { console.log(`DB 오류: ${error.message}`); }
      else { console.log(`${holdings.length}개 종목 저장`); synced++; }

      await new Promise((r) => setTimeout(r, 600));
    }

    await ctx.storageState({ path: KRX_STORAGE_STATE });
    console.log(`\n완료: ${synced}개 ETF 저장, ${skipped}개 스킵`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("ETF 구성종목 싱크 실패:", err);
  process.exitCode = 1;
});
