import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import { chromium, type Page } from "playwright";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Database } from "../src/lib/supabase/database.types";

loadEnvConfig(process.cwd());

const KRX_PAGE =
  "https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201020501";
const KRX_HOME = "https://data.krx.co.kr/contents/MDC/MAIN/main/index.cmd";
const KRX_API = "/comm/bldAttendant/getJsonData.cmd";
const KRX_STORAGE_STATE = resolve(process.env.KRX_STORAGE_STATE ?? ".krx-storage-state.json");
const BATCH_SIZE = 500;
const CHROME_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

type KrxRow = Record<string, string | number | null | undefined>;

interface TerRow {
  symbol: string;
  name: string;
  ter: number;
  source_date: string;
  fetched_at: string;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required in .env.local`);
  return value;
}

function kstDateDaysAgo(daysAgo: number): string {
  const date = new Date(Date.now() + 9 * 60 * 60 * 1000);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function text(row: KrxRow, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function parsePercent(value: string): number | null {
  const trimmed = value.replaceAll(",", "").replace("%", "").trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed / 100;
}

async function requestKrx(page: Page, tradeDate: string): Promise<KrxRow[]> {
  const response = await page.evaluate(
    async ({ api, tradeDate }) => {
      const body = new URLSearchParams({
        bld: "dbms/MDC/STAT/standard/MDCSTAT04301",
        locale: "ko_KR",
        trdDd: tradeDate,
        share: "1",
        money: "1",
        csvxls_isNo: "false",
      });
      const result = await fetch(api, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
        },
        body,
      });
      const payload = await result.text();
      return { status: result.status, payload };
    },
    { api: KRX_API, tradeDate },
  );

  if (response.status === 400 && response.payload.trim() === "LOGOUT") {
    throw new Error("KRX rejected the browser session (LOGOUT)");
  }
  if (response.status === 400) {
    if (process.env.DEBUG_KRX) console.warn(`KRX 400 body: ${response.payload.slice(0, 500)}`);
    return [];
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`KRX returned HTTP ${response.status}`);
  }

  const payload = JSON.parse(response.payload);
  if (payload?.result?.code === "LOGOUT") {
    throw new Error("KRX session expired (LOGOUT)");
  }
  return Array.isArray(payload?.output) ? payload.output : [];
}

async function fetchLatestRows(page: Page): Promise<{ tradeDate: string; rows: KrxRow[] }> {
  const override = process.env.KRX_TRADE_DATE?.replaceAll("-", "");
  const dates = override ? [override] : Array.from({ length: 10 }, (_, index) => kstDateDaysAgo(index));

  for (const tradeDate of dates) {
    const rows = await requestKrx(page, tradeDate);
    if (rows.length > 0) return { tradeDate, rows };
  }
  throw new Error(`KRX returned no ETF rows for: ${dates.join(", ")}`);
}

function normalizeRows(rows: KrxRow[], tradeDate: string, fetchedAt: string): TerRow[] {
  const sourceDate = `${tradeDate.slice(0, 4)}-${tradeDate.slice(4, 6)}-${tradeDate.slice(6, 8)}`;
  const normalized = new Map<string, TerRow>();

  for (const row of rows) {
    const symbol = text(row, ["ISU_SRT_CD", "ISU_CD"]);
    const name = text(row, ["ISU_ABBRV", "ISU_NM", "ISU_ABBRV_NM"]);
    const ter = parsePercent(text(row, ["TOT_EXEC_FEERT", "EXEC_FEERT", "FEE", "TER", "TOT_FEE"]));
    if (!/^\d{6}$/.test(symbol) || !name || ter == null || ter >= 1) continue;
    normalized.set(symbol, { symbol, name, ter, source_date: sourceDate, fetched_at: fetchedAt });
  }

  if (normalized.size === 0) {
    const keys = rows[0] ? Object.keys(rows[0]).join(", ") : "none";
    const sample = rows[0] ? JSON.stringify(rows[0]) : "none";
    throw new Error(`No valid TER rows parsed. KRX fields: ${keys}\nSample row: ${sample}`);
  }
  return [...normalized.values()];
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
    const page = await context.newPage();
    const home = await page.goto(KRX_HOME, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
    if (!home?.ok()) {
      throw new Error(`KRX home returned HTTP ${home?.status() ?? "unknown"}`);
    }
    const navigation = await page.goto(KRX_PAGE, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
    if (!navigation?.ok()) {
      throw new Error(`KRX page returned HTTP ${navigation?.status() ?? "unknown"}`);
    }
    await page.waitForTimeout(1_500);
    if (page.url().includes("MDCCOMS001")) {
      if (!interactive) {
        throw new Error(
          "KRX login is required. Run once with KRX_INTERACTIVE=1, then sign in in the opened browser.",
        );
      }
      console.log("Sign in to KRX in the opened browser. Waiting up to 5 minutes...");
      await page.waitForURL((url) => !url.href.includes("MDCCOMS001"), { timeout: 300_000 });
      await context.storageState({ path: KRX_STORAGE_STATE });
      await page.goto(KRX_PAGE, { waitUntil: "networkidle", timeout: 60_000 });
    }
    if (process.env.DEBUG_KRX) {
      console.log("KRX page:", await page.title(), page.url());
      console.log("KRX cookies:", (await page.context().cookies()).map(({ name }) => name));
    }
    const fetchedAt = new Date().toISOString();
    const { tradeDate, rows } = await fetchLatestRows(page);
    const normalized = normalizeRows(rows, tradeDate, fetchedAt);
    await context.storageState({ path: KRX_STORAGE_STATE });

    for (let start = 0; start < normalized.length; start += BATCH_SIZE) {
      const { error } = await supabase
        .from("etf_ter_cache")
        .upsert(normalized.slice(start, start + BATCH_SIZE), { onConflict: "symbol" });
      if (error) throw error;
    }

    const { error: deleteError } = await supabase
      .from("etf_ter_cache")
      .delete()
      .lt("fetched_at", fetchedAt);
    if (deleteError) throw deleteError;

    console.log(`Synced ${normalized.length} KRX ETF TER rows for ${tradeDate}.`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("KRX TER sync failed:", error);
  process.exitCode = 1;
});
