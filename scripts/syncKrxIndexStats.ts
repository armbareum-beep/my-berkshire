/**
 * KRX 한국 지수 PER/PBR 싱크
 * BLD: dbms/MDC/STAT/standard/MDCSTAT00701 (PER/PBR/배당수익률 추이)
 * 필드: WT_PER, WT_STKPRC_NETASST_RTO(PBR), DIV_YD, IDX_NM
 *
 * 실행: npm run sync:krx-index
 * 처음 로그인: $env:KRX_INTERACTIVE="1"; npm run sync:krx-index
 */

import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Database } from "../src/lib/supabase/database.types";

loadEnvConfig(process.cwd());

const KRX_HOME = "https://data.krx.co.kr/contents/MDC/MAIN/main/index.cmd";
const KRX_PER_PAGE = "https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201010107";
const KRX_API_URL = "https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd";
const KRX_STORAGE_STATE = resolve(process.env.KRX_STORAGE_STATE ?? ".krx-storage-state.json");
const CHROME_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

type KrxRow = Record<string, string | number | null | undefined>;

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required in .env.local`);
  return v;
}

function kstDateDaysAgo(n: number): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10).replaceAll("-", "");
}

function parseNum(row: KrxRow, ...keys: string[]): number | null {
  for (const key of keys) {
    const raw = row[key];
    if (raw == null) continue;
    const n = Number(String(raw).replaceAll(",", "").trim());
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/**
 * 카테고리 행에서 PER 값이 실제로 있는 대표 지수 행 선택.
 * 당일(장중·미발표)은 PER이 null이라 제외 → 직전 영업일/유효 행으로 폴백.
 * 정확 명칭("코스피"/"코스닥") 우선, 그다음 최신 거래일(TRD_DD).
 * row=null 이면 sample(매칭은 됐으나 PER 없는 행)로 실제 키를 진단.
 */
function pickIndexRow(rows: KrxRow[], kw: string): { row: KrxRow | null; sample: KrxRow | null } {
  const matches = rows.filter((r) => String(r.IDX_NM ?? "").includes(kw));
  const valid = matches.filter((r) => parseNum(r, "WT_PER", "PER") != null);
  if (valid.length === 0) return { row: null, sample: matches[0] ?? null };
  valid.sort((a, b) => {
    const ea = String(a.IDX_NM ?? "").trim() === kw ? 0 : 1;
    const eb = String(b.IDX_NM ?? "").trim() === kw ? 0 : 1;
    if (ea !== eb) return ea - eb;
    return String(b.TRD_DD ?? "").localeCompare(String(a.TRD_DD ?? ""));
  });
  return { row: valid[0], sample: matches[0] ?? null };
}

async function fetchRows(ctx: import("playwright").BrowserContext, trdDd: string, idxIndMidclssCd: string): Promise<KrxRow[]> {
  const strtDd = trdDd.slice(0, 6) + "01"; // 해당 월 1일부터
  const body = new URLSearchParams({
    bld: "dbms/MDC/STAT/standard/MDCSTAT00701",
    locale: "ko_KR",
    searchType: "A",
    idxIndMidclssCd,
    trdDd,
    tboxindTpCd_finder_equidx0_0: "",
    indTpCd: "",
    indTpCd2: "",
    codeNmindTpCd_finder_equidx0_0: "",
    param1indTpCd_finder_equidx0_0: "",
    strtDd,
    endDd: trdDd,
    csvxls_isNo: "false",
  });
  const res = await ctx.request.fetch(KRX_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: KRX_PER_PAGE,
    },
    data: body.toString(),
  });
  const text = await res.text();
  if (text.trim() === "LOGOUT") throw new Error("KRX session expired (LOGOUT)");
  let json: Record<string, unknown>;
  try { json = JSON.parse(text); } catch { throw new Error(`JSON parse failed: ${text.slice(0, 300)}`); }
  if ((json?.result as { code?: string } | undefined)?.code === "LOGOUT") throw new Error("KRX LOGOUT in response");
  return Array.isArray(json?.output) ? (json.output as KrxRow[]) : [];
}

async function main() {
  const supabase = createClient<Database>(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const interactive = process.env.KRX_INTERACTIVE === "1";
  const browser = await chromium.launch({
    headless: !interactive,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  try {
    const context = await browser.newContext({
      locale: "ko-KR",
      userAgent: CHROME_USER_AGENT,
      extraHTTPHeaders: { "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8" },
      storageState: existsSync(KRX_STORAGE_STATE) ? KRX_STORAGE_STATE : undefined,
    });
    // 실제 PER/PBR 페이지 방문 후 API 호출 (Referer + 서버 세션 상태 맞춤)
    const page = await context.newPage();
    await page.goto(KRX_PER_PAGE, { waitUntil: "networkidle", timeout: 60_000 });
    if (page.url().includes("MDCCOMS001")) {
      if (!interactive)
        throw new Error("KRX login required. Run with $env:KRX_INTERACTIVE='1'");
      console.log("KRX 로그인 후 PER/PBR 추이 페이지로 이동하세요. 최대 5분 대기...");
      await page.waitForURL((u) => !u.href.includes("MDCCOMS001"), { timeout: 300_000 });
      await context.storageState({ path: KRX_STORAGE_STATE });
      await page.goto(KRX_PER_PAGE, { waitUntil: "networkidle", timeout: 60_000 });
    }
    await context.storageState({ path: KRX_STORAGE_STATE });

    // 최근 영업일 탐색 (최대 10일). idxIndMidclssCd: 02=KOSPI, 03=KOSDAQ
    const override = process.env.KRX_TRADE_DATE?.replaceAll("-", "");
    const dates = override
      ? [override]
      : Array.from({ length: 10 }, (_, i) => kstDateDaysAgo(i));

    const syncedAt = new Date().toISOString();
    let found = false;
    let dumped = false;

    for (const trdDd of dates) {
      const [ksRows, kqRows] = await Promise.all([
        fetchRows(context, trdDd, "02"),
        fetchRows(context, trdDd, "03"),
      ]);

      if (process.env.DEBUG_KRX) {
        console.log(`[DEBUG trdDd=${trdDd}] KOSPI rows=${ksRows.length} IDX_NM: ${ksRows.map(r => r.IDX_NM).join(" | ")}`);
        console.log(`[DEBUG trdDd=${trdDd}] KOSDAQ rows=${kqRows.length} IDX_NM: ${kqRows.map(r => r.IDX_NM).join(" | ")}`);
      }

      const ks = pickIndexRow(ksRows, "코스피");
      const kq = pickIndexRow(kqRows, "코스닥");

      if (!ks.row && !kq.row) {
        const sample = ks.sample ?? kq.sample;
        if (sample && !dumped) {
          // 행은 있으나 PER 파싱 불가 — 당일 미발표(장중)이거나 필드명 불일치.
          // 실제 키를 덤프해 다음 영업일 폴백/진단에 쓴다.
          console.log(`[trdDd=${trdDd}] 코스피/코스닥 행은 있으나 PER 파싱 불가(당일 미발표 또는 필드명 불일치).`);
          console.log(`  실제 필드 키: ${Object.keys(sample).join(", ")}`);
          console.log(`  샘플 행: ${JSON.stringify(sample)}`);
          dumped = true;
        }
        continue; // 이전 영업일/유효 행으로
      }

      const toStat = (row: KrxRow, symbol: string) => {
        const dy = parseNum(row, "DIV_YD", "DIV_YLD", "DVD_YLD");
        return {
          symbol,
          per: parseNum(row, "WT_PER", "PER"),
          pbr: parseNum(row, "WT_STKPRC_NETASST_RTO", "PBR"),
          eps: null as number | null,
          dividend_yield: dy != null ? dy / 100 : null,
          listed_count: null as number | null,
          synced_at: syncedAt,
        };
      };

      const results = [
        ks.row && toStat(ks.row, "^KS11"),
        kq.row && toStat(kq.row, "^KQ11"),
      ].filter((r): r is NonNullable<typeof r> => r !== null);

      const dataDd = ks.row?.TRD_DD ?? kq.row?.TRD_DD ?? trdDd;
      console.log(`조회 트레이드일: ${trdDd} (데이터 거래일: ${dataDd})`);
      for (const r of results) {
        console.log(`  ${r.symbol}  PER=${r.per}  PBR=${r.pbr}  DY=${r.dividend_yield}`);
      }

      const { error } = await supabase
        .from("krx_index_stats_cache")
        .upsert(results, { onConflict: "symbol" });
      if (error) throw error;

      console.log(`Synced ${results.length} KRX index stat rows.`);
      found = true;
      break;
    }

    if (!found) throw new Error("KRX에서 코스피/코스닥 행을 찾지 못했습니다.");
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("KRX index stats sync failed:", e);
  process.exitCode = 1;
});
