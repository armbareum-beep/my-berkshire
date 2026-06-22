/**
 * KIS 종목마스터 동기화 — 한글 종목검색 인덱스(kis_security_master) 적재.
 *
 * 한국투자증권 공개 종목마스터를 다운로드(KIS 토큰 불필요)·압축해제(내장 zlib)·
 * cp949 디코딩·파싱해 Supabase 에 upsert 한다. 일 1회 실행 가정.
 *
 *   npm run sync:kis-master
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import zlib from "node:zlib";
import type { Database } from "../src/lib/supabase/database.types";
import {
  parseDomesticMaster,
  parseOverseasMaster,
  type KisMasterRow,
} from "../src/lib/finance/kis/masterParse";

loadEnvConfig(process.cwd());

const BASE = "https://new.real.download.dws.co.kr/common/master";
const BATCH = 500;

const DOMESTIC: { file: string; exchange: "KOSPI" | "KOSDAQ" }[] = [
  { file: "kospi_code.mst.zip", exchange: "KOSPI" },
  { file: "kosdaq_code.mst.zip", exchange: "KOSDAQ" },
];
const OVERSEAS = ["nas", "nys", "ams"]; // 미국: NASDAQ / NYSE / AMEX

interface MasterRow extends KisMasterRow {
  source_date: string;
  fetched_at: string;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required in .env.local`);
  return value;
}

function kstDate(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 단일 파일 zip(.mst.zip/.cod.zip) → 압축해제 후 cp949 텍스트. */
function unzipToText(buf: Buffer): string {
  if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error("invalid zip header");
  const method = buf.readUInt16LE(8);
  const flags = buf.readUInt16LE(6);
  let compSize = buf.readUInt32LE(18);
  const fnLen = buf.readUInt16LE(26);
  const extraLen = buf.readUInt16LE(28);
  const dataStart = 30 + fnLen + extraLen;
  if (flags & 0x08 || compSize === 0) {
    // 데이터 디스크립터: 로컬헤더에 크기 없음 → 중앙 디렉터리에서 조회
    const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const cdOffset = buf.readUInt32LE(eocd + 16);
    compSize = buf.readUInt32LE(cdOffset + 20);
  }
  const comp = buf.subarray(dataStart, dataStart + compSize);
  const raw = method === 8 ? zlib.inflateRawSync(comp) : Buffer.from(comp);
  return new TextDecoder("euc-kr").decode(raw);
}

async function download(file: string): Promise<string> {
  const res = await fetch(`${BASE}/${file}`);
  if (!res.ok) throw new Error(`${file} download HTTP ${res.status}`);
  return unzipToText(Buffer.from(await res.arrayBuffer()));
}

async function main() {
  const supabase = createClient<Database>(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const sourceDate = kstDate();
  const fetchedAt = new Date().toISOString();
  const bySymbol = new Map<string, MasterRow>();

  const stamp = (rows: KisMasterRow[]) => {
    for (const r of rows) {
      bySymbol.set(r.symbol, { ...r, source_date: sourceDate, fetched_at: fetchedAt });
    }
  };

  for (const { file, exchange } of DOMESTIC) {
    stamp(parseDomesticMaster(await download(file), exchange));
  }
  for (const mkt of OVERSEAS) {
    stamp(parseOverseasMaster(await download(`${mkt}mst.cod.zip`)));
  }

  const rows = [...bySymbol.values()];
  if (rows.length === 0) throw new Error("no master rows parsed");

  for (let start = 0; start < rows.length; start += BATCH) {
    const { error } = await supabase
      .from("kis_security_master")
      .upsert(rows.slice(start, start + BATCH), { onConflict: "symbol" });
    if (error) throw error;
  }

  const { error: deleteError } = await supabase
    .from("kis_security_master")
    .delete()
    .lt("fetched_at", fetchedAt);
  if (deleteError) throw deleteError;

  const kr = rows.filter((r) => r.market === "KR").length;
  console.log(`Synced ${rows.length} KIS securities (KR ${kr}, US ${rows.length - kr}) for ${sourceDate}.`);
}

main().catch((error) => {
  console.error("KIS master sync failed:", error);
  process.exitCode = 1;
});
