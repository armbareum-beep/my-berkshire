/**
 * KRX PER/PBR BLD 탐색 — 브라우저 직접 열어서 실제 요청 캡처.
 * 실행: npx tsx scripts/findKrxPerBld.ts
 * 브라우저가 열리면 KRX 로그인 후 "PER/PBR/배당수익률 추이" 메뉴 클릭.
 * 자동으로 모든 XHR 요청을 캡처해서 출력함.
 */

import { loadEnvConfig } from "@next/env";
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

loadEnvConfig(process.cwd());

const KRX_HOME = "https://data.krx.co.kr";
const KRX_STORAGE_STATE = resolve(".krx-storage-state.json");
const CHROME_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function main() {
  const browser = await chromium.launch({
    headless: false, // 항상 브라우저 보임
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const context = await browser.newContext({
    locale: "ko-KR",
    userAgent: CHROME_USER_AGENT,
    extraHTTPHeaders: { "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8" },
  });

  const captured: Array<{ bld: string; fields: string[]; rows: number; hasPer: boolean }> = [];

  context.on("response", async (response) => {
    if (!response.url().includes("getJsonData.cmd")) return;
    if (response.request().method() !== "POST") return;
    try {
      const rawBody = response.request().postData() ?? "";
      const params = Object.fromEntries(new URLSearchParams(rawBody));
      const bld = params.bld ?? "(no bld)";
      const text = await response.text();
      if (!text.startsWith("{")) return;
      const json = JSON.parse(text);
      const rows: Record<string, unknown>[] = Array.isArray(json?.output) ? json.output : [];
      if (rows.length === 0) return;
      const fields = Object.keys(rows[0]);
      const hasPer = fields.some((f) =>
        ["PER", "PBR", "DIV_YLD", "EPS"].some((k) => f.toUpperCase().includes(k)),
      );
      const marker = hasPer ? "✅ PER있음" : "      ";
      const entry = { bld, fields, rows: rows.length, hasPer };
      // 중복 bld 스킵
      if (!captured.some((c) => c.bld === bld)) {
        captured.push(entry);
        console.log(`${marker}  bld=${bld}  rows=${rows.length}`);
        console.log(`          fields: ${fields.join(", ")}`);
        if (hasPer) {
          const referer = response.request().headers()["referer"] ?? "(없음)";
          console.log(`          ★ 전체 POST body: ${rawBody}`);
          console.log(`          ★ Referer: ${referer}`);
          console.log(`          ★ 샘플 IDX_NM (처음 5개): ${rows.slice(0, 5).map(r => r.IDX_NM).join(" | ")}`);
          console.log(`          ★ 전체 IDX_NM: ${rows.map(r => r.IDX_NM).join(" | ")}`);
        }
        console.log();
      }
    } catch { /* 무시 */ }
  });

  const page = await context.newPage();
  await page.goto(KRX_HOME, { waitUntil: "load", timeout: 30_000 });

  console.log("──────────────────────────────────────────────");
  console.log("브라우저가 열렸습니다.");
  console.log("1. KRX 로그인 (이미 로그인 상태면 스킵)");
  console.log("2. 주가지수 → PER/PBR/배당수익률 추이 메뉴 클릭");
  console.log("3. 데이터가 로드되면 여기 터미널에 결과가 표시됩니다");
  console.log("4. 완료되면 브라우저를 닫으세요");
  console.log("──────────────────────────────────────────────\n");

  // 브라우저 닫힐 때까지 대기
  await new Promise<void>((resolve) => {
    context.on("close", resolve);
    browser.on("disconnected", resolve);
  });

  // 세션 저장
  try {
    await context.storageState({ path: KRX_STORAGE_STATE });
    console.log(`\n세션 저장됨: ${KRX_STORAGE_STATE}`);
  } catch { /* 이미 닫힘 */ }

  console.log(`\n──── 캡처 결과 (총 ${captured.length}개 BLD) ────`);
  const perBlds = captured.filter((c) => c.hasPer);
  if (perBlds.length > 0) {
    console.log("\n✅ PER/PBR 포함된 BLD:");
    for (const c of perBlds) {
      console.log(`  ${c.bld}`);
      console.log(`  fields: ${c.fields.join(", ")}`);
    }
  } else {
    console.log("\n⚠️  PER/PBR 필드를 가진 BLD 없음. 모든 캡처:");
    for (const c of captured) {
      console.log(`  ${c.bld}  fields: ${c.fields.join(", ")}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
