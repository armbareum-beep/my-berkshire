import { getEtfStats } from "@/lib/finance/etfStats";
import { EtfDonutChart, ChartDatasets, ChartSlice } from "./EtfDonutChart";

interface EtfSliceInput {
  symbol: string;
  name: string;
  value: number;
  etfWeight: number;
}

function regionOf(name: string, symbol: string): string {
  if (
    name.includes("미국") ||
    name.includes("S&P") ||
    name.includes("나스닥") ||
    name.includes("Nasdaq") ||
    name.includes("다우")
  )
    return "미국";
  if (name.includes("중국") || name.includes("차이나")) return "중국";
  if (name.includes("일본")) return "일본";
  if (name.includes("인도")) return "인도";
  if (name.includes("신흥국") || name.includes("이머징")) return "신흥국";
  if (
    name.includes("글로벌") ||
    name.includes("선진국") ||
    name.includes("World") ||
    name.includes("MSCI")
  )
    return "글로벌";
  if (name.includes("유럽")) return "유럽";
  if (/^\d{6}$/.test(symbol)) return "국내";
  return "해외";
}

function assetTypeOf(name: string): string {
  if (
    name.includes("채권") ||
    name.includes("Bond") ||
    name.includes("국채") ||
    name.includes("회사채")
  )
    return "채권";
  if (name.includes("리츠") || name.includes("REIT") || name.includes("부동산"))
    return "리츠";
  if (
    name.includes("원자재") ||
    name.includes("Gold") ||
    name.includes("골드") ||
    name.includes("금현물") ||
    name.includes("원유")
  )
    return "원자재";
  if (name.includes("TDF") || name.includes("혼합") || name.includes("멀티에셋"))
    return "혼합";
  return "주식";
}

function aggregate(items: { key: string; weight: number }[]): ChartSlice[] {
  const map = new Map<string, number>();
  for (const { key, weight } of items) {
    map.set(key, (map.get(key) ?? 0) + weight);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, weight]) => ({ name, weight }));
}

export async function EtfChartStreamed({
  etfSlices,
  totalEtfValue,
  embedded,
}: {
  etfSlices: EtfSliceInput[];
  totalEtfValue: number;
  /** true면 카드 래퍼 없이 렌더 — 다른 카드 내부에 삽입할 때. */
  embedded?: boolean;
}) {
  const etfShare: ChartSlice[] = etfSlices.map((s) => ({
    name: s.name,
    weight: s.etfWeight,
  }));

  const region = aggregate(
    etfSlices.map((s) => ({ key: regionOf(s.name, s.symbol), weight: s.etfWeight })),
  );

  const assetType = aggregate(
    etfSlices.map((s) => ({ key: assetTypeOf(s.name), weight: s.etfWeight })),
  );

  // 섹터: Yahoo Finance 병렬 호출
  const statsResults = await Promise.allSettled(
    etfSlices.map((s) => getEtfStats(s.symbol)),
  );
  const sectorItems: { key: string; weight: number }[] = [];
  for (let i = 0; i < etfSlices.length; i++) {
    const r = statsResults[i];
    if (r.status !== "fulfilled" || !r.value) continue;
    const share = totalEtfValue > 0 ? etfSlices[i].value / totalEtfValue : 0;
    for (const sec of r.value.sectors) {
      sectorItems.push({ key: sec.name, weight: share * sec.weight });
    }
  }
  const sector = aggregate(sectorItems);

  const datasets: ChartDatasets = { etfShare, sector, region, assetType };

  return <EtfDonutChart datasets={datasets} embedded={embedded} />;
}
