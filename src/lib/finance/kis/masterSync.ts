/**
 * KIS 종목마스터 싱크 코어 — 한글 종목검색 인덱스(kis_security_master) 적재.
 *
 * 한국투자증권 공개 종목마스터를 다운로드(KIS 토큰 불필요)·압축해제(내장 zlib)·
 * cp949 디코딩·파싱해 Supabase 에 upsert 한다.
 *
 * fetch + 인메모리 zlib 뿐이라 파일시스템을 쓰지 않음 → 서버(Vercel cron)에서도
 * 그대로 실행 가능한 유일한 싱크(KRX 3종은 Playwright 세션, 로고는 public/ 파일이라 불가).
 * 이 파일은 scripts/syncKisMaster.ts(로컬 PC 폴백)와 api/cron/sync-kis-master(서버)가 공유한다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import zlib from "node:zlib";
import type { Database } from "@/lib/supabase/database.types";
import { todayKST } from "@/lib/date";
import {
  parseDomesticMaster,
  parseOverseasMaster,
  type KisMasterRow,
} from "./masterParse";

const BASE = "https://new.real.download.dws.co.kr/common/master";
// 서버리스 60s 제한 대비 라운드트립 축소(기존 500 → 1000, 배치 수 절반).
const BATCH = 1000;

const DOMESTIC: { file: string; exchange: "KOSPI" | "KOSDAQ" }[] = [
  { file: "kospi_code.mst.zip", exchange: "KOSPI" },
  { file: "kosdaq_code.mst.zip", exchange: "KOSDAQ" },
];
const OVERSEAS = ["nas", "nys", "ams"]; // 미국: NASDAQ / NYSE / AMEX

interface MasterRow extends KisMasterRow {
  source_date: string;
  fetched_at: string;
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

/**
 * 국내(KOSPI·KOSDAQ)·해외(NASDAQ·NYSE·AMEX) 종목마스터를 받아 upsert 하고,
 * 이번 실행에서 갱신되지 않은 기존 행(스테일)은 삭제한다.
 * @returns 적재된 총 행 수와 그중 국내(KR) 행 수.
 */
export async function syncKisMaster(
  supabase: SupabaseClient<Database>,
): Promise<{ rows: number; kr: number }> {
  const sourceDate = todayKST();
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
  return { rows: rows.length, kr };
}
